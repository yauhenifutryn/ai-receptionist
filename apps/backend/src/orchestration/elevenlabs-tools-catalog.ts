/**
 * Workspace tool catalog client for ElevenLabs ConvAI.
 *
 * Background: EL deprecated inline `prompt.tools: [...]` on /v1/convai/agents
 * in favor of a workspace-level tool catalog referenced by `prompt.tool_ids`.
 * PATCHing the old inline field returns HTTP 200 but the tools are silently
 * dropped — the agent then has no tool bindings and can't call backend
 * webhooks. This module wraps the catalog endpoints so provisionAgent /
 * updateAgentTools can register tools in the workspace once and bind to them
 * by id from then on.
 *
 * Verified live 2026-05-20:
 *   GET    /v1/convai/tools                 -> { tools: [{id, tool_config, ...}] }
 *   POST   /v1/convai/tools                 -> created tool with `id`
 *   PATCH  /v1/convai/agents/{id} body
 *     conversation_config.agent.prompt.tool_ids = [id, id]
 *
 * EL canonicalizes the POST body server-side; fields like path_params_schema,
 * query_params_schema, request_headers, response_body_schema, content_type,
 * and auth_connection are auto-populated. We do not send them.
 */

/** Logical webhook tool definition — provider-agnostic shape. */
export interface ToolSpec {
  name: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  requestBodySchema: unknown;
  /** EL allows 1–120s; default 20s matches what we used in the old inline form. */
  responseTimeoutSecs?: number;
}

/** Normalized workspace tool entry returned from /v1/convai/tools. */
export interface CatalogTool {
  id: string;
  name: string;
}

/**
 * Booking tools we register on every agent. The two specs map 1:1 onto the
 * backend handlers at apps/backend/src/tools/{check-availability,create-booking}.ts.
 *
 * Schemas must keep `description` on every primitive — EL rejects (HTTP 400)
 * primitives without one of: description, dynamic_variable, is_system_provided,
 * constant_value. The walker in elevenlabs-tools-catalog.test.ts enforces this.
 */
export function buildToolSpecs(serverToolBaseUrl: string): ToolSpec[] {
  return [
    {
      name: "check_availability",
      description: "List up to 5 appointment slots for a service category.",
      url: `${serverToolBaseUrl}/tools/check-availability`,
      method: "POST",
      requestBodySchema: {
        type: "object",
        properties: {
          serviceCategory: {
            type: "string",
            description:
              "Type of appointment the caller is asking about. Pick the closest match from the enum.",
            enum: [
              "consultation",
              "routine_service",
              "complex_service",
              "follow_up",
              "emergency_triage",
              "information_only",
              "other",
            ],
          },
          preferredWindow: {
            type: "object",
            description:
              "Optional caller-stated time window. ISO 8601 datetimes (UTC).",
            properties: {
              from: {
                type: "string",
                description:
                  "Earliest acceptable slot start (ISO 8601 UTC). Omit if caller has no preference.",
              },
              to: {
                type: "string",
                description:
                  "Latest acceptable slot start (ISO 8601 UTC). Omit if caller has no preference.",
              },
            },
          },
        },
        required: ["serviceCategory"],
      },
    },
    {
      name: "create_booking",
      description: "Create a booking after the caller confirms a slot.",
      url: `${serverToolBaseUrl}/tools/create-booking`,
      method: "POST",
      requestBodySchema: {
        type: "object",
        properties: {
          slotId: {
            type: "string",
            description:
              "Slot identifier returned by a prior check_availability call.",
          },
          patientName: {
            type: "string",
            description:
              "Caller's full name as spelled by the caller. Polish diacritics preserved.",
          },
          patientPhone: {
            type: "string",
            description:
              "DO NOT ask the caller for their phone number. Pass an empty string ''. The system fills the phone number automatically from the inbound SIP caller_id, or skips SMS confirmation when there is no caller_id (browser test / PIN demo). Only include a non-empty value if the caller volunteered the number unprompted and you confirmed it back to them.",
          },
          serviceCategory: {
            type: "string",
            description:
              "Must match the serviceCategory used in check_availability for this slot.",
          },
          notes: {
            type: "string",
            description:
              "Optional short note from the caller (chief complaint, preferred doctor, etc.).",
          },
        },
        required: ["slotId", "patientName", "serviceCategory"],
      },
    },
  ];
}

/**
 * Name-only manifest of the booking tools we register. Lets callers
 * (e.g. backfill scripts, dashboards) reason about expected tools without
 * needing a serverToolBaseUrl.
 */
export const TOOL_SPECS: ReadonlyArray<{ name: string }> = [
  { name: "check_availability" },
  { name: "create_booking" },
];

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_RESPONSE_TIMEOUT_SECS = 20;

export interface ElevenLabsToolsCatalogOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class ElevenLabsToolsCatalog {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(opts: ElevenLabsToolsCatalogOptions) {
    if (!opts.apiKey) {
      throw new Error("ElevenLabsToolsCatalog: apiKey required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.doFetch = opts.fetcher ?? fetch;
  }

  /**
   * List every tool registered in the current workspace. Output is normalized
   * to {id, name} — full tool_config / access_info / usage_stats are dropped
   * because callers only need id-by-name lookup.
   */
  async listWorkspaceTools(): Promise<CatalogTool[]> {
    const body = await this.request<{
      tools?: Array<{ id?: string; tool_config?: { name?: string } }>;
    }>("GET", "/v1/convai/tools");
    const list = body.tools ?? [];
    const out: CatalogTool[] = [];
    for (const entry of list) {
      const id = entry?.id;
      const name = entry?.tool_config?.name;
      if (typeof id === "string" && typeof name === "string") {
        out.push({ id, name });
      }
    }
    return out;
  }

  /**
   * Idempotent: returns the workspace tool id for `spec.name` if one exists,
   * otherwise POSTs a new tool to the catalog and returns the new id.
   *
   * EL accepts a minimal `tool_config` body — anything not in the POST is
   * server-defaulted. We deliberately do NOT send path_params_schema, headers,
   * etc.; sending them risks rejection if the schema tightens.
   */
  async findOrCreateTool(spec: ToolSpec): Promise<string> {
    const existing = await this.listWorkspaceTools();
    const match = existing.find((t) => t.name === spec.name);
    if (match) return match.id;

    const body = await this.request<{ id?: string; tool_id?: string }>(
      "POST",
      "/v1/convai/tools",
      {
        tool_config: {
          type: "webhook",
          name: spec.name,
          description: spec.description,
          response_timeout_secs:
            spec.responseTimeoutSecs ?? DEFAULT_RESPONSE_TIMEOUT_SECS,
          api_schema: {
            url: spec.url,
            method: spec.method,
            request_body_schema: spec.requestBodySchema,
          },
        },
      },
    );
    const id = body.id ?? body.tool_id;
    if (!id) {
      throw new Error(
        `ElevenLabs POST /v1/convai/tools returned no tool id (name=${spec.name})`,
      );
    }
    return id;
  }

  /**
   * Bind the two booking tools (check_availability, create_booking) into the
   * workspace catalog, creating any that are missing. Returns the tool_ids
   * for callers to attach via PATCH /v1/convai/agents/{id}.
   */
  async ensureBookingTools(serverToolBaseUrl: string): Promise<{
    checkAvailabilityId: string;
    createBookingId: string;
  }> {
    const specs = buildToolSpecs(serverToolBaseUrl);
    const ca = specs.find((s) => s.name === "check_availability");
    const cb = specs.find((s) => s.name === "create_booking");
    if (!ca || !cb) {
      throw new Error("ensureBookingTools: TOOL_SPECS missing booking tools");
    }
    // Sequential, not parallel: if both are missing, the second call's
    // listWorkspaceTools needs to see the first POST's effect to stay
    // idempotent. Parallel would risk two creates for the same name.
    const checkAvailabilityId = await this.findOrCreateTool(ca);
    const createBookingId = await this.findOrCreateTool(cb);
    return { checkAvailabilityId, createBookingId };
  }

  private async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        "xi-api-key": this.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    const res = await this.doFetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `ElevenLabs ${method} ${path} failed: ${res.status} ${text}`,
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as T;
  }
}

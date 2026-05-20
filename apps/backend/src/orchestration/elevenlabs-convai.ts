import type {
  DeleteAgentInput,
  ProvisionAgentInput,
  ProvisionAgentResult,
  UpdateAgentKnowledgeInput,
  UploadKnowledgeDocumentInput,
  UploadKnowledgeDocumentResult,
  VoiceAgentProvider,
} from "@ai-receptionist/contracts";
import { buildSystemPrompt } from "../prompts/system-prompt.js";

/**
 * ElevenLabs ConvAI implementation of the VoiceAgentProvider contract.
 *
 * - Voice ID defaults to mr1ubFaLs5xVrh1EqWtc (Polish-native multilingual,
 *   locked in CLAUDE.md + AI-SPEC).
 * - Privacy hardened at provisioning per RODO: audio recording OFF,
 *   call data retention 0 days. Workspace-level "use for training" toggle
 *   must be flipped OFF in the EL UI (cannot be done via API).
 * - Agent in-call LLM defaults to qwen36-35b-a3b (~223ms latency,
 *   ~$0.0023/min — ultra-low-latency tier on ElevenLabs). Fallback if Polish
 *   quality disappoints: claude-haiku-4-5
 *   (~676ms, ~$0.0075/min, Anthropic Polish quality known-good).
 */

export const DEFAULT_VOICE_ID = "mr1ubFaLs5xVrh1EqWtc";
export const DEFAULT_AGENT_LLM = "qwen36-35b-a3b";
export const DEFAULT_AGENT_TEMPERATURE = 0.3;
export const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

/**
 * EL ConvAI validates every primitive property in a tool's
 * request_body_schema and rejects (HTTP 400) any that doesn't declare one of:
 * `description`, `dynamic_variable`, `is_system_provided`, `constant_value`.
 * We use `description` everywhere — it's what the agent's LLM reads to pick
 * the right value, so it has user-visible value beyond satisfying validation.
 *
 * Single source of truth: both provisionAgent (create) and updateAgentTools
 * (PATCH retrofit) call this so the schemas can't drift.
 */
function buildToolsDefinition(serverToolBaseUrl: string) {
  return [
    {
      type: "webhook",
      name: "check_availability",
      description: "List up to 5 appointment slots for a service category.",
      api_schema: {
        url: `${serverToolBaseUrl}/tools/check-availability`,
        method: "POST",
        content_type: "application/json",
        request_body_schema: {
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
    },
    {
      type: "webhook",
      name: "create_booking",
      description: "Create a booking after the caller confirms a slot.",
      api_schema: {
        url: `${serverToolBaseUrl}/tools/create-booking`,
        method: "POST",
        content_type: "application/json",
        request_body_schema: {
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
                "Caller's callback phone number in E.164 (e.g. +48501234567). Confirm with the caller verbally before submitting.",
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
          required: [
            "slotId",
            "patientName",
            "patientPhone",
            "serviceCategory",
          ],
        },
      },
    },
  ];
}

export interface ElevenLabsConvAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  /** Override the agent's in-call LLM (default claude-sonnet-4-6). */
  agentLlm?: string;
  /** Override the default voice id. */
  defaultVoiceId?: string;
}

export class ElevenLabsConvAIProvider implements VoiceAgentProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly agentLlm: string;
  private readonly defaultVoiceId: string;

  constructor(opts: ElevenLabsConvAIProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabsConvAIProvider: ELEVENLABS_API_KEY missing");
    }
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.doFetch = opts.fetcher ?? fetch;
    this.agentLlm = opts.agentLlm ?? DEFAULT_AGENT_LLM;
    this.defaultVoiceId =
      opts.defaultVoiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  }

  async uploadKnowledgeDocument(
    input: UploadKnowledgeDocumentInput,
  ): Promise<UploadKnowledgeDocumentResult> {
    const body = await this.request<{ id?: string; document_id?: string }>(
      "POST",
      "/v1/convai/knowledge-base/text",
      {
        name: input.name,
        text: input.markdown,
      },
    );
    const documentId = body.id ?? body.document_id;
    if (!documentId) {
      throw new Error("ElevenLabs upload returned no document id");
    }
    return { documentId };
  }

  async provisionAgent(input: ProvisionAgentInput): Promise<ProvisionAgentResult> {
    const voiceId = input.voiceId ?? this.defaultVoiceId;
    const language = input.defaultLanguage ?? "pl";
    const systemPrompt =
      input.systemPromptOverride ??
      buildSystemPrompt({
        tenantDisplayName: input.tenantDisplayName,
      });

    const body = await this.request<{ agent_id?: string; id?: string }>(
      "POST",
      "/v1/convai/agents/create",
      {
        name: `${input.tenantDisplayName} - receptionist`,
        conversation_config: {
          agent: {
            // The agent speaks first when the call connects (otherwise it
            // waits silently for the caller to say something, which broke
            // user expectations in testing). Polish opener with AI
            // disclosure baked in so it's correct on the very first turn.
            first_message: `Dzień dobry, mówi asystent sztucznej inteligencji w ${input.tenantDisplayName}. W czym mogę pomóc?`,
            prompt: {
              prompt: systemPrompt,
              llm: this.agentLlm,
              temperature: DEFAULT_AGENT_TEMPERATURE,
              knowledge_base: input.knowledgeBaseDocumentIds.map((documentId) => ({
                // ElevenLabs ConvAI knowledge_base entry shape:
                //   type: "file" | "url" | "text" | "folder"  (REQUIRED)
                //   name: string                              (REQUIRED)
                //   id:   string  document id from upload     (REQUIRED)
                //   usage_mode: "prompt" | "auto"             (default: auto)
                // We upload via POST /v1/convai/knowledge-base/text, so the
                // correct type is "text" — NOT "document" (which 422s).
                type: "text",
                id: documentId,
                name: `${input.tenantDisplayName} - knowledge`,
                usage_mode: "auto",
              })),
              // Chat B (2026-05-20): booking tools enabled. Backend handlers
              // at apps/backend/src/tools/{check-availability,create-booking}.ts
              // run against SimulatedCalendarProvider; real provider plugs in
              // post-pilot via the CalendarProvider interface.
              tools: buildToolsDefinition(input.serverToolBaseUrl),
            },
            language,
          },
          tts: {
            // For non-English agents (we're Polish-first), ElevenLabs
            // requires either `eleven_turbo_v2_5` or `eleven_flash_v2_5`.
            // Flash v2.5 wins on ~75ms latency + full multilingual including
            // Polish; Turbo v2.5 is slightly higher quality but slower. For
            // a phone agent, latency dominates perceived quality.
            model_id: "eleven_flash_v2_5",
            voice_id: voiceId,
            // stability 0.85 = receptionist-grade flatness. We started at
            // 0.45 (too dramatic), 0.65 (still energetic), 0.8 (better).
            // 0.85 is calm-professional. Going to 1.0 sounds robotic;
            // below 0.7 leaks emotional intonation.
            stability: 0.85,
            similarity_boost: 0.75,
            // speed 0.8 = noticeably slower than default 1.0. Phone callers
            // (often elderly, often stressed) prefer a measured pace; 0.9
            // still read as too fast in user testing. 0.8 is the sweet
            // spot; going below ~0.75 sounds sluggish.
            speed: 0.8,
          },
          asr: {
            // `scribe_realtime` is ElevenLabs' streaming ASR (their newest):
            // lower perceived latency, better interrupt handling, stronger
            // Polish accuracy than the default turn-based engine. For a
            // phone receptionist where the caller's speech is the bottleneck
            // on response time, this is the right pick.
            provider: "scribe_realtime",
            quality: "high",
            user_input_audio_format: "pcm_16000",
          },
          turn: { turn_timeout: 7, mode: "turn" },
        },
        platform_settings: {
          privacy: {
            record_voice: false,
            store_call_audio: false,
            retain_call_data_days: 0,
          },
          webhook: {
            post_call_url: input.postCallWebhookUrl,
          },
          tenant_metadata: { tenant_id: input.tenantId },
        },
      },
    );

    const agentId = body.agent_id ?? body.id;
    if (!agentId) {
      throw new Error("ElevenLabs provisionAgent returned no agent id");
    }
    return {
      agentId,
      browserTestUrl: `https://elevenlabs.io/app/conversational-ai/agents/${agentId}`,
    };
  }

  async updateAgentKnowledge(input: UpdateAgentKnowledgeInput): Promise<void> {
    await this.request("PATCH", `/v1/convai/agents/${input.agentId}`, {
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: input.knowledgeBaseDocumentIds.map((documentId) => ({
              // type "text" — uploaded via /v1/convai/knowledge-base/text.
              type: "text",
              id: documentId,
              name: documentId,
              usage_mode: "auto",
            })),
          },
        },
      },
    });
  }

  async deleteAgent(input: DeleteAgentInput): Promise<void> {
    await this.request("DELETE", `/v1/convai/agents/${input.agentId}`);
  }

  /**
   * Refresh the tools[] block on an existing agent without re-provisioning.
   * Used when the tool catalog changes (e.g. adding check_availability +
   * create_booking to agents that were provisioned before those tools shipped).
   */
  async updateAgentTools(input: {
    agentId: string;
    serverToolBaseUrl: string;
  }): Promise<void> {
    await this.request("PATCH", `/v1/convai/agents/${input.agentId}`, {
      conversation_config: {
        agent: {
          prompt: {
            tools: buildToolsDefinition(input.serverToolBaseUrl),
          },
        },
      },
    });
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
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
      throw new Error(`ElevenLabs ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as T;
  }
}

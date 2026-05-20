import { describe, it, expect, vi } from "vitest";
import {
  ElevenLabsToolsCatalog,
  TOOL_SPECS,
  buildToolSpecs,
} from "../../src/orchestration/elevenlabs-tools-catalog.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(call: [unknown, RequestInit | undefined]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe("ElevenLabsToolsCatalog", () => {
  describe("TOOL_SPECS / buildToolSpecs", () => {
    it("emits two specs (check_availability + create_booking) with full urls", () => {
      const specs = buildToolSpecs("https://backend.example.com");
      expect(specs).toHaveLength(2);
      expect(specs.map((s) => s.name).sort()).toEqual([
        "check_availability",
        "create_booking",
      ]);
      const ca = specs.find((s) => s.name === "check_availability")!;
      const cb = specs.find((s) => s.name === "create_booking")!;
      expect(ca.url).toBe("https://backend.example.com/tools/check-availability");
      expect(cb.url).toBe("https://backend.example.com/tools/create-booking");
      expect(ca.method).toBe("POST");
      expect(cb.method).toBe("POST");
    });

    it("name-only TOOL_SPECS constant lists the two booking tool names", () => {
      expect(TOOL_SPECS.map((s) => s.name).sort()).toEqual([
        "check_availability",
        "create_booking",
      ]);
    });

    it("every primitive in request_body_schema declares a description (EL 400 guard)", () => {
      const specs = buildToolSpecs("https://x");
      function walk(obj: unknown, path: string): string[] {
        if (!obj || typeof obj !== "object") return [];
        const o = obj as Record<string, unknown>;
        const failures: string[] = [];
        if (
          typeof o.type === "string" &&
          ["string", "number", "boolean", "integer"].includes(o.type) &&
          typeof o.description !== "string"
        ) {
          failures.push(`${path}.${o.type} missing description`);
        }
        if (o.properties && typeof o.properties === "object") {
          for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
            failures.push(...walk(v, `${path}.${k}`));
          }
        }
        return failures;
      }
      const failures = specs.flatMap((s) =>
        walk(s.requestBodySchema, `specs.${s.name}`),
      );
      expect(failures).toEqual([]);
    });
  });

  describe("listWorkspaceTools", () => {
    it("GETs /v1/convai/tools and normalises to {id, name}", async () => {
      const fetcher = vi.fn().mockResolvedValue(
        jsonResponse({
          tools: [
            {
              id: "tool_aaa",
              tool_config: { name: "check_availability", type: "webhook" },
            },
            {
              id: "tool_bbb",
              tool_config: { name: "create_booking", type: "webhook" },
            },
          ],
        }),
      );
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      const tools = await cat.listWorkspaceTools();
      expect(tools).toEqual([
        { id: "tool_aaa", name: "check_availability" },
        { id: "tool_bbb", name: "create_booking" },
      ]);
      const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.elevenlabs.io/v1/convai/tools");
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
    });
  });

  describe("findOrCreateTool", () => {
    it("returns existing tool id when name already in workspace (no POST)", async () => {
      const fetcher = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          tools: [
            { id: "tool_existing", tool_config: { name: "check_availability" } },
          ],
        }),
      );
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      const id = await cat.findOrCreateTool({
        name: "check_availability",
        description: "x",
        url: "https://x/y",
        method: "POST",
        requestBodySchema: { type: "object", properties: {} },
      });
      expect(id).toBe("tool_existing");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((fetcher.mock.calls[0] as [unknown, RequestInit])[1].method).toBe("GET");
    });

    it("POSTs /v1/convai/tools when not in workspace and returns the new id", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ tools: [] }))
        .mockResolvedValueOnce(jsonResponse({ id: "tool_new123" }));
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      const id = await cat.findOrCreateTool({
        name: "check_availability",
        description: "desc",
        url: "https://x/check",
        method: "POST",
        requestBodySchema: { type: "object", properties: { a: { type: "string", description: "d" } } },
        responseTimeoutSecs: 20,
      });
      expect(id).toBe("tool_new123");
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [postUrl, postInit] = fetcher.mock.calls[1] as [string, RequestInit];
      expect(postUrl).toBe("https://api.elevenlabs.io/v1/convai/tools");
      expect(postInit.method).toBe("POST");
      const body = parseBody(fetcher.mock.calls[1] as [unknown, RequestInit | undefined]);
      const tc = body.tool_config as Record<string, unknown>;
      expect(tc.type).toBe("webhook");
      expect(tc.name).toBe("check_availability");
      expect(tc.description).toBe("desc");
      expect(tc.response_timeout_secs).toBe(20);
      const apiSchema = tc.api_schema as Record<string, unknown>;
      expect(apiSchema.url).toBe("https://x/check");
      expect(apiSchema.method).toBe("POST");
      expect(apiSchema.request_body_schema).toEqual({
        type: "object",
        properties: { a: { type: "string", description: "d" } },
      });
    });

    it("defaults response_timeout_secs to 20 when not provided", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ tools: [] }))
        .mockResolvedValueOnce(jsonResponse({ id: "tool_new" }));
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      await cat.findOrCreateTool({
        name: "x",
        description: "x",
        url: "https://x",
        method: "POST",
        requestBodySchema: {},
      });
      const body = parseBody(fetcher.mock.calls[1] as [unknown, RequestInit | undefined]);
      expect((body.tool_config as Record<string, unknown>).response_timeout_secs).toBe(20);
    });
  });

  describe("ensureBookingTools", () => {
    it("returns both ids when both tools already exist (zero POSTs)", async () => {
      // Use a factory: each fetch call gets a fresh Response — Response bodies
      // are single-use streams, so a shared instance would 500 on the 2nd read.
      const fetcher = vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            tools: [
              { id: "tool_ca", tool_config: { name: "check_availability" } },
              { id: "tool_cb", tool_config: { name: "create_booking" } },
            ],
          }),
        ),
      );
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      const ids = await cat.ensureBookingTools("https://backend.example.com");
      expect(ids).toEqual({
        checkAvailabilityId: "tool_ca",
        createBookingId: "tool_cb",
      });
      // Should not POST (no create calls).
      const postCalls = fetcher.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(postCalls).toHaveLength(0);
    });

    it("creates the missing tool and returns the new id alongside the existing one", async () => {
      const fetcher = vi
        .fn()
        // First listWorkspaceTools call (inside findOrCreate for check_availability).
        .mockResolvedValueOnce(
          jsonResponse({
            tools: [{ id: "tool_existing_ca", tool_config: { name: "check_availability" } }],
          }),
        )
        // Second listWorkspaceTools call (inside findOrCreate for create_booking).
        .mockResolvedValueOnce(
          jsonResponse({
            tools: [{ id: "tool_existing_ca", tool_config: { name: "check_availability" } }],
          }),
        )
        // POST to create create_booking.
        .mockResolvedValueOnce(jsonResponse({ id: "tool_new_cb" }));
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      const ids = await cat.ensureBookingTools("https://backend.example.com");
      expect(ids).toEqual({
        checkAvailabilityId: "tool_existing_ca",
        createBookingId: "tool_new_cb",
      });
      const postCalls = fetcher.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
      const postBody = parseBody(postCalls[0] as [unknown, RequestInit | undefined]);
      expect((postBody.tool_config as Record<string, unknown>).name).toBe("create_booking");
    });
  });

  describe("error handling", () => {
    it("throws when listWorkspaceTools returns non-2xx", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("nope", { status: 401 }));
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      await expect(cat.listWorkspaceTools()).rejects.toThrow(/401/);
    });

    it("throws when POST /v1/convai/tools returns no id", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ tools: [] }))
        .mockResolvedValueOnce(jsonResponse({}));
      const cat = new ElevenLabsToolsCatalog({ apiKey: "xi", fetcher });
      await expect(
        cat.findOrCreateTool({
          name: "x",
          description: "x",
          url: "https://x",
          method: "POST",
          requestBodySchema: {},
        }),
      ).rejects.toThrow(/no tool id/i);
    });
  });
});

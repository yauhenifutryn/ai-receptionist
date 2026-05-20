import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_AGENT_LLM,
  DEFAULT_VOICE_ID,
  ElevenLabsConvAIProvider,
} from "../../src/orchestration/elevenlabs-convai.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(call: [unknown, RequestInit | undefined]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe("ElevenLabsConvAIProvider (W2.2)", () => {
  it("uploadKnowledgeDocument POSTs markdown to /v1/convai/knowledge-base/text", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "doc-123" }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    const result = await provider.uploadKnowledgeDocument({
      tenantId: "t-1",
      name: "Łapka knowledge",
      markdown: "# Łapka\n## Usługi i ceny\n- Konsultacja: 180 PLN",
    });
    expect(result).toEqual({ documentId: "doc-123" });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/knowledge-base/text");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test");
    expect(parseBody(fetcher.mock.calls[0] as [unknown, RequestInit | undefined])).toMatchObject({
      name: "Łapka knowledge",
      text: "# Łapka\n## Usługi i ceny\n- Konsultacja: 180 PLN",
    });
  });

  it("provisionAgent POSTs hardened privacy + locked voice + tool_ids", async () => {
    // EL ConvAI deprecated inline `prompt.tools: [...]` in favor of a
    // workspace catalog referenced by `prompt.tool_ids`. provisionAgent now
    // calls ensureBookingTools() first to get the ids, then attaches them.
    // The 3 GET/POST traffic for the catalog comes first; agents/create last.
    const fetcher = vi
      .fn()
      // listWorkspaceTools (called inside ensureBookingTools → findOrCreate
      // for check_availability). Both tools already exist in workspace.
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            tools: [
              { id: "tool_ca", tool_config: { name: "check_availability" } },
              { id: "tool_cb", tool_config: { name: "create_booking" } },
            ],
          }),
        ),
      )
      // listWorkspaceTools (second findOrCreate, for create_booking).
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            tools: [
              { id: "tool_ca", tool_config: { name: "check_availability" } },
              { id: "tool_cb", tool_config: { name: "create_booking" } },
            ],
          }),
        ),
      )
      // POST /v1/convai/agents/create
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-77" }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    const result = await provider.provisionAgent({
      tenantId: "t-1",
      tenantDisplayName: "Klinika Łapka",
      knowledgeBaseDocumentIds: ["doc-1", "doc-2"],
      serverToolBaseUrl: "https://backend.example.com",
      postCallWebhookUrl: "https://backend.example.com/post-call",
    });
    expect(result.agentId).toBe("agent-77");
    expect(result.browserTestUrl).toContain("agent-77");

    // Find the agents/create call (last one).
    const createIdx = fetcher.mock.calls.findIndex(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/v1/convai/agents/create"),
    );
    expect(createIdx).toBeGreaterThanOrEqual(0);
    const [url, init] = fetcher.mock.calls[createIdx] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/agents/create");
    expect(init.method).toBe("POST");

    const body = parseBody(fetcher.mock.calls[createIdx] as [unknown, RequestInit | undefined]);
    const platform = body.platform_settings as Record<string, Record<string, unknown>>;
    expect(platform.privacy).toEqual({
      record_voice: false,
      store_call_audio: false,
      retain_call_data_days: 0,
    });
    expect(platform.webhook).toEqual({ post_call_url: "https://backend.example.com/post-call" });
    expect(platform.tenant_metadata).toEqual({ tenant_id: "t-1" });

    const conv = body.conversation_config as Record<string, Record<string, unknown>>;
    expect((conv.tts as Record<string, unknown>).voice_id).toBe(DEFAULT_VOICE_ID);
    const agent = conv.agent as Record<string, Record<string, unknown>>;
    const prompt = agent.prompt as Record<string, unknown>;
    expect(prompt.llm).toBe(DEFAULT_AGENT_LLM);
    expect(prompt.temperature).toBe(0.3);
    expect(agent.language).toBe("pl");

    // Chat C (2026-05-20): tools attached via workspace catalog tool_ids,
    // NOT inline `prompt.tools`. EL deprecated the inline form — PATCHes
    // succeeded (200) but the tools were silently dropped server-side. The
    // tool_ids must reference workspace tools that already exist (or were
    // just created by ensureBookingTools).
    expect(prompt.tools).toBeUndefined();
    const toolIds = prompt.tool_ids as string[];
    expect(toolIds).toHaveLength(2);
    expect(toolIds.sort()).toEqual(["tool_ca", "tool_cb"]);

    // ElevenLabs ConvAI knowledge_base entry shape is
    // { type, id, name, usage_mode }, NOT a flat document_id. Using "text"
    // because we upload via POST /v1/convai/knowledge-base/text. The old
    // { document_id } shape returns 422 from the agents/create endpoint.
    const kb = prompt.knowledge_base as Array<Record<string, unknown>>;
    expect(kb).toEqual([
      { type: "text", id: "doc-1", name: "Klinika Łapka - knowledge", usage_mode: "auto" },
      { type: "text", id: "doc-2", name: "Klinika Łapka - knowledge", usage_mode: "auto" },
    ]);

    // Hard-pinned TTS / ASR / first-message guardrails. If any of these
    // regress, calls either 400 (non-English TTS without flash/turbo model)
    // or deliver a degraded experience (default voice, default first
    // message). See memory project_ai_receptionist_agent_config.
    expect(agent.first_message).toBe(
      "Dzień dobry, mówi asystent sztucznej inteligencji w Klinika Łapka. W czym mogę pomóc?",
    );
    expect((conv.tts as Record<string, unknown>).model_id).toBe("eleven_flash_v2_5");
    expect((conv.tts as Record<string, unknown>).stability).toBe(0.85);
    expect((conv.tts as Record<string, unknown>).speed).toBe(0.8);
    expect((conv.asr as Record<string, unknown>).provider).toBe("scribe_realtime");

    expect((prompt.prompt as string).toLowerCase()).toContain("klinika łapka");
    expect(prompt.prompt as string).toContain("Czy zgadza się");
  });

  it("provisionAgent applies a caller-provided voice override when given", async () => {
    // Two catalog GETs + one agents/create POST. Tools already exist so no
    // catalog POSTs.
    const catalogListFactory = () =>
      Promise.resolve(
        jsonResponse({
          tools: [
            { id: "tool_ca", tool_config: { name: "check_availability" } },
            { id: "tool_cb", tool_config: { name: "create_booking" } },
          ],
        }),
      );
    const fetcher = vi
      .fn()
      .mockImplementationOnce(catalogListFactory)
      .mockImplementationOnce(catalogListFactory)
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    await provider.provisionAgent({
      tenantId: "t-1",
      tenantDisplayName: "Tenant",
      knowledgeBaseDocumentIds: [],
      serverToolBaseUrl: "https://x",
      postCallWebhookUrl: "https://x/p",
      voiceId: "custom-voice-xyz",
    });
    const createIdx = fetcher.mock.calls.findIndex(
      (c) => typeof c[0] === "string" && (c[0] as string).endsWith("/v1/convai/agents/create"),
    );
    const body = parseBody(fetcher.mock.calls[createIdx] as [unknown, RequestInit | undefined]);
    const conv = body.conversation_config as Record<string, Record<string, unknown>>;
    expect((conv.tts as Record<string, unknown>).voice_id).toBe("custom-voice-xyz");
  });

  it("updateAgentKnowledge PATCHes only the knowledge_base list", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    await provider.updateAgentKnowledge({
      agentId: "agent-77",
      knowledgeBaseDocumentIds: ["doc-9"],
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/agents/agent-77");
    expect(init.method).toBe("PATCH");
    const body = parseBody(fetcher.mock.calls[0] as [unknown, RequestInit | undefined]);
    expect(body).toMatchObject({
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: [{ type: "text", id: "doc-9", name: "doc-9", usage_mode: "auto" }],
          },
        },
      },
    });
  });

  it("updateAgentTools PATCHes prompt.tool_ids (not inline tools) onto an existing agent", async () => {
    // Catalog: tool_ca exists, tool_cb missing → one POST creates it. Then
    // PATCH on agent with tool_ids = [ca, new_cb].
    const fetcher = vi
      .fn()
      // listWorkspaceTools (for check_availability find).
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            tools: [
              { id: "tool_ca", tool_config: { name: "check_availability" } },
            ],
          }),
        ),
      )
      // listWorkspaceTools (for create_booking find — still missing).
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            tools: [
              { id: "tool_ca", tool_config: { name: "check_availability" } },
            ],
          }),
        ),
      )
      // POST create create_booking.
      .mockResolvedValueOnce(jsonResponse({ id: "tool_cb_new" }))
      // PATCH /v1/convai/agents/{id}
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    await provider.updateAgentTools({
      agentId: "agent-77",
      serverToolBaseUrl: "https://backend.example.com",
    });
    const patchIdx = fetcher.mock.calls.findIndex(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).endsWith("/v1/convai/agents/agent-77") &&
        (c[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchIdx).toBeGreaterThanOrEqual(0);
    const body = parseBody(fetcher.mock.calls[patchIdx] as [unknown, RequestInit | undefined]);
    const prompt = (
      body.conversation_config as Record<string, Record<string, Record<string, unknown>>>
    ).agent.prompt as Record<string, unknown>;
    // Old inline form must NOT be sent — that's the regression we're guarding.
    expect(prompt.tools).toBeUndefined();
    const toolIds = prompt.tool_ids as string[];
    expect(toolIds).toEqual(["tool_ca", "tool_cb_new"]);
  });

  // Note: the EL ConvAI "every primitive has description" 400-guard walker
  // moved to test/orchestration/elevenlabs-tools-catalog.test.ts — the tool
  // definitions now live in buildToolSpecs() in elevenlabs-tools-catalog.ts,
  // which is the only place that POSTs the schemas to EL. The walker still
  // runs against the same source of truth.

  it("deleteAgent DELETEs /v1/convai/agents/{id}", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    await provider.deleteAgent({ agentId: "agent-77" });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/agents/agent-77");
    expect(init.method).toBe("DELETE");
  });

  it("throws on non-2xx response with status code in error message", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    const provider = new ElevenLabsConvAIProvider({ apiKey: "xi-test", fetcher });
    await expect(
      provider.provisionAgent({
        tenantId: "t-1",
        tenantDisplayName: "Tenant",
        knowledgeBaseDocumentIds: [],
        serverToolBaseUrl: "https://x",
        postCallWebhookUrl: "https://x/p",
      }),
    ).rejects.toThrow(/401/);
  });

  it("throws when ELEVENLABS_API_KEY is missing from env and opts", () => {
    const orig = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      expect(() => new ElevenLabsConvAIProvider({})).toThrow(/ELEVENLABS_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.ELEVENLABS_API_KEY = orig;
    }
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchElevenLabsConversation } from "../../../src/integrations/elevenlabs/conversation.js";

describe("fetchElevenLabsConversation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed body on 200", async () => {
    const sample = { conversation_id: "c1", transcript: [], metadata: {} };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(sample), { status: 200 })),
    );
    const r = await fetchElevenLabsConversation({
      conversationId: "c1",
      apiKey: "k",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.conversation_id).toBe("c1");
  });

  it("returns { ok: false, status: 404 } on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const r = await fetchElevenLabsConversation({
      conversationId: "missing",
      apiKey: "k",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("returns { ok: false, status: 'timeout' } on AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.reject(new DOMException("aborted", "AbortError"))),
    );
    const r = await fetchElevenLabsConversation({
      conversationId: "c1",
      apiKey: "k",
      timeoutMs: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe("timeout");
  });
});

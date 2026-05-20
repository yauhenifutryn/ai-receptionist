import { describe, it, expect, vi } from "vitest";
import { createPostCallRouter } from "../../src/post-call/router.js";
import type { PostCallRepository } from "../../src/post-call/repository.js";

const baseRepo: PostCallRepository = {
  async resolveTenantByAgent(id) {
    return id === "agent-77" ? { tenantId: "tenant-1", agentRowId: "agent-row-1" } : null;
  },
  async upsertConsentLog() {},
  async insertTranscript() {},
  async lookupServiceValue() {
    return null;
  },
  async updateBookingRecoveredRevenue() {},
  async upsertConversation() {},
  async findBookingIdByConversation() {
    return null;
  },
  async resolveAgentPin() {
    return null;
  },
};

const validPayload = {
  conversationId: "conv-1",
  agentId: "agent-77",
  startedAt: "2026-05-16T13:00:00.000Z",
  endedAt: "2026-05-16T13:01:00.000Z",
  durationSeconds: 60,
  endReason: "caller_hangup",
  direction: "inbound",
  transcript: [],
  toolInvocations: [],
  derived: {
    callerLanguage: "pl",
    consentDecision: "yes",
    consentFlag: true,
    escalated: false,
  },
};

describe("post-call HTTP router (W2.4)", () => {
  it("POST /webhooks/post-call returns 200 on valid payload", async () => {
    const app = createPostCallRouter({ repo: baseRepo });
    const res = await app.request("/webhooks/post-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.tenantId).toBe("tenant-1");
    expect(json.consentLogged).toBe(true);
  });

  it("POST /webhooks/post-call returns 400 on garbage body", async () => {
    const app = createPostCallRouter({ repo: baseRepo });
    const res = await app.request("/webhooks/post-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("POST /webhooks/post-call returns 404 when agentId unknown", async () => {
    const app = createPostCallRouter({ repo: baseRepo });
    const res = await app.request("/webhooks/post-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPayload, agentId: "agent-unknown" }),
    });
    expect(res.status).toBe(404);
  });
});

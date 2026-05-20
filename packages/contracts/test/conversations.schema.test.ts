import { describe, it, expect } from "vitest";
import {
  ConversationSourceSchema,
  ConversationRowSchema,
  FinalizeConversationRequestSchema,
  ListConversationsQuerySchema,
} from "../src/conversations.schema.js";

describe("ConversationSourceSchema", () => {
  it("accepts the three sources", () => {
    expect(ConversationSourceSchema.parse("pstn")).toBe("pstn");
    expect(ConversationSourceSchema.parse("browser_test")).toBe("browser_test");
    expect(ConversationSourceSchema.parse("pin_demo")).toBe("pin_demo");
  });
  it("rejects unknown source", () => {
    expect(() => ConversationSourceSchema.parse("sms")).toThrow();
  });
});

describe("FinalizeConversationRequestSchema", () => {
  it("requires conversationId, agentId, source", () => {
    expect(() => FinalizeConversationRequestSchema.parse({})).toThrow();
  });
  it("requires pin when source=pin_demo", () => {
    expect(() =>
      FinalizeConversationRequestSchema.parse({
        conversationId: "c1",
        agentId: "agent_x",
        source: "pin_demo",
      }),
    ).toThrow();
  });
  it("accepts pin_demo with pin", () => {
    const r = FinalizeConversationRequestSchema.parse({
      conversationId: "c1",
      agentId: "agent_x",
      source: "pin_demo",
      pin: "4242",
    });
    expect(r.pin).toBe("4242");
  });
});

describe("ListConversationsQuerySchema", () => {
  it("coerces booked-only flag from string", () => {
    const r = ListConversationsQuerySchema.parse({ bookedOnly: "1" });
    expect(r.bookedOnly).toBe(true);
  });
  it("defaults date range to undefined", () => {
    const r = ListConversationsQuerySchema.parse({});
    expect(r.dateFrom).toBeUndefined();
  });
});

describe("ConversationRowSchema", () => {
  it("accepts a full row with null transcript-bearing fields for web", () => {
    expect(
      ConversationRowSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
        conversationId: "c1",
        tenantId: "22222222-2222-2222-2222-222222222222",
        providerAgentId: "agent_x",
        source: "browser_test",
        startedAt: "2026-05-21T10:00:00.000Z",
        durationSeconds: 42,
        toolCallCount: 0,
        toolErrorCount: 0,
        escalated: false,
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:00:00.000Z",
      }),
    ).toMatchObject({ source: "browser_test" });
  });
});

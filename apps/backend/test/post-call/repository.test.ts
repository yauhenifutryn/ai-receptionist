import { describe, it, expect } from "vitest";
import { createSupabasePostCallRepository } from "../../src/post-call/supabase-repository.js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tests for the conversation-related additions to the post-call repository
 * (Wave 2 Task 4). Older repository methods are exercised end-to-end via
 * handler.test.ts; these tests focus on the new upsert + lookup paths.
 */

function upsertCaptureClient(captured: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      captured.table = table;
      return {
        upsert(payload: unknown, opts: unknown) {
          captured.upsertPayload = payload;
          captured.upsertOpts = opts;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

function bookingLookupClient(result: { id: string } | null): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: result, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("supabase post-call repository — conversations", () => {
  it("upsertConversation maps camelCase args to snake_case columns and upserts on conversation_id", async () => {
    const captured: Record<string, unknown> = {};
    const repo = createSupabasePostCallRepository(upsertCaptureClient(captured));
    await repo.upsertConversation({
      conversationId: "c1",
      tenantId: "t-uuid",
      agentId: "a-uuid",
      providerAgentId: "agent_x",
      source: "pstn",
      direction: "inbound",
      startedAt: "2026-05-21T10:00:00Z",
      endedAt: "2026-05-21T10:02:00Z",
      durationSeconds: 120,
      endReason: "hangup_caller",
      consentFlag: true,
      consentDecision: "yes",
      callerLanguage: "pl",
      appointmentCategory: "consultation",
      escalated: false,
      toolCallCount: 2,
      toolErrorCount: 0,
      rawJsonb: { transcript: [] },
      finalizedAt: "2026-05-21T10:01:00Z",
      callerPhoneE164: "+48500111222",
    });
    expect(captured.table).toBe("conversations");
    expect(captured.upsertOpts).toEqual({ onConflict: "conversation_id" });
    const payload = captured.upsertPayload as Record<string, unknown>;
    expect(payload.conversation_id).toBe("c1");
    expect(payload.tenant_id).toBe("t-uuid");
    expect(payload.agent_id).toBe("a-uuid");
    expect(payload.provider_agent_id).toBe("agent_x");
    expect(payload.source).toBe("pstn");
    expect(payload.direction).toBe("inbound");
    expect(payload.started_at).toBe("2026-05-21T10:00:00Z");
    expect(payload.ended_at).toBe("2026-05-21T10:02:00Z");
    expect(payload.duration_seconds).toBe(120);
    expect(payload.end_reason).toBe("hangup_caller");
    expect(payload.consent_flag).toBe(true);
    expect(payload.consent_decision).toBe("yes");
    expect(payload.caller_language).toBe("pl");
    expect(payload.appointment_category).toBe("consultation");
    expect(payload.escalated).toBe(false);
    expect(payload.tool_call_count).toBe(2);
    expect(payload.tool_error_count).toBe(0);
    expect(payload.raw_jsonb).toEqual({ transcript: [] });
    expect(payload.finalized_at).toBe("2026-05-21T10:01:00Z");
    expect(payload.caller_phone_e164).toBe("+48500111222");
  });

  it("upsertConversation maps caller_phone_e164 to null when arg omitted", async () => {
    const captured: Record<string, unknown> = {};
    const repo = createSupabasePostCallRepository(upsertCaptureClient(captured));
    await repo.upsertConversation({
      conversationId: "c2",
      tenantId: "t-uuid",
      agentId: "a-uuid",
      providerAgentId: "agent_x",
      source: "browser_test",
      startedAt: "2026-05-21T10:00:00Z",
    });
    const payload = captured.upsertPayload as Record<string, unknown>;
    expect(payload.caller_phone_e164).toBeNull();
  });

  it("findBookingIdByConversation returns null when not found", async () => {
    const repo = createSupabasePostCallRepository(bookingLookupClient(null));
    expect(await repo.findBookingIdByConversation("nope")).toBeNull();
  });

  it("findBookingIdByConversation returns booking uuid when found", async () => {
    const repo = createSupabasePostCallRepository(bookingLookupClient({ id: "booking-uuid" }));
    expect(await repo.findBookingIdByConversation("c1")).toBe("booking-uuid");
  });
});

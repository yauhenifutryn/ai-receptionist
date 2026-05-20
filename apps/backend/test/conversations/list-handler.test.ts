import { describe, it, expect } from "vitest";
import { handleListConversations } from "../../src/conversations/list-handler.js";

const row = {
  id: "00000000-0000-0000-0000-000000000001",
  conversation_id: "c1",
  tenant_id: "11111111-1111-1111-1111-111111111111",
  agent_id: null,
  provider_agent_id: "agent_x",
  source: "pin_demo",
  direction: null,
  started_at: "2026-05-21T10:00:00.000Z",
  ended_at: null,
  duration_seconds: 42,
  end_reason: null,
  consent_flag: null,
  consent_decision: null,
  caller_language: "pl",
  appointment_category: null,
  escalated: false,
  escalation_reason: null,
  booked_booking_id: null,
  tool_call_count: 0,
  tool_error_count: 0,
  raw_jsonb: null,
  finalized_at: null,
  created_at: "2026-05-21T10:00:00.000Z",
  updated_at: "2026-05-21T10:00:00.000Z",
};

function builder(captured: Record<string, unknown>) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select(s: string) {
      captured.select = s;
      return chain;
    },
    eq(c: string, v: unknown) {
      filters[c] = v;
      return chain;
    },
    gte(c: string, v: unknown) {
      filters[`${c}>=`] = v;
      return chain;
    },
    lte(c: string, v: unknown) {
      filters[`${c}<=`] = v;
      return chain;
    },
    in(c: string, v: unknown) {
      filters[`${c} IN`] = v;
      return chain;
    },
    not(c: string, op: string, v: unknown) {
      filters[`${c} ${op}`] = v;
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      captured.filters = filters;
      return Promise.resolve({ data: [row], error: null });
    },
  };
  return chain;
}

describe("handleListConversations", () => {
  it("operator with agentId returns all sources", async () => {
    const captured: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => builder(captured) } as any;
    const r = await handleListConversations(
      { agentId: "agent_x", limit: 50 },
      { audience: "operator", supabase },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toHaveLength(1);
    const f = captured.filters as Record<string, unknown>;
    expect(f.provider_agent_id).toBe("agent_x");
    expect(f["source IN"]).toBeUndefined();
  });

  it("owner default hides browser_test", async () => {
    const captured: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => builder(captured) } as any;
    await handleListConversations(
      { limit: 50 },
      { audience: "owner", tenantId: "t-uuid", supabase },
    );
    const f = captured.filters as Record<string, unknown>;
    expect(f["source IN"]).toEqual(["pstn", "pin_demo"]);
  });

  it("owner with includeBrowserTest shows all sources", async () => {
    const captured: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => builder(captured) } as any;
    await handleListConversations(
      { limit: 50, includeBrowserTest: true },
      { audience: "owner", tenantId: "t-uuid", supabase },
    );
    const f = captured.filters as Record<string, unknown>;
    expect(f["source IN"]).toBeUndefined();
  });

  it("prospect path forces source=pin_demo and provider_agent_id", async () => {
    const captured: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => builder(captured) } as any;
    await handleListConversations(
      { agentId: "agent_x", limit: 50 },
      { audience: "prospect", supabase },
    );
    const f = captured.filters as Record<string, unknown>;
    expect(f.source).toBe("pin_demo");
    expect(f.provider_agent_id).toBe("agent_x");
  });
});

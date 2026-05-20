import { describe, it, expect, vi } from "vitest";
import { handlePostCall } from "../../src/post-call/handler.js";
import type {
  PostCallRepository,
  InsertConsentLogArgs,
  InsertTranscriptArgs,
  ServiceValueLookupArgs,
  ServiceValueLookupResult,
  UpdateBookingRevenueArgs,
  UpsertConversationArgs,
} from "../../src/post-call/repository.js";
import type { TenantBinding } from "../../src/tools/repository.js";

function buildRepo(overrides: Partial<PostCallRepository> = {}): {
  repo: PostCallRepository;
  spies: {
    upsertConsentLog: ReturnType<typeof vi.fn>;
    insertTranscript: ReturnType<typeof vi.fn>;
    lookupServiceValue: ReturnType<typeof vi.fn>;
    updateBookingRecoveredRevenue: ReturnType<typeof vi.fn>;
    resolveTenantByAgent: ReturnType<typeof vi.fn>;
    upsertConversation: ReturnType<typeof vi.fn>;
    findBookingIdByConversation: ReturnType<typeof vi.fn>;
  };
} {
  const upsertConsentLog = vi.fn(async (_args: InsertConsentLogArgs) => {});
  const insertTranscript = vi.fn(async (_args: InsertTranscriptArgs) => {});
  const lookupServiceValue = vi.fn(
    async (_args: ServiceValueLookupArgs): Promise<ServiceValueLookupResult | null> => null,
  );
  const updateBookingRecoveredRevenue = vi.fn(async (_args: UpdateBookingRevenueArgs) => {});
  const resolveTenantByAgent = vi.fn(
    async (id: string): Promise<TenantBinding | null> =>
      id === "agent-77" ? { tenantId: "tenant-1", agentRowId: "agent-row-1" } : null,
  );
  const upsertConversation = vi.fn(async (_args: UpsertConversationArgs) => {});
  const findBookingIdByConversation = vi.fn(async (_id: string): Promise<string | null> => null);

  const repo: PostCallRepository = {
    resolveTenantByAgent,
    upsertConsentLog,
    insertTranscript,
    lookupServiceValue,
    updateBookingRecoveredRevenue,
    upsertConversation,
    findBookingIdByConversation,
    ...overrides,
  };
  return {
    repo,
    spies: {
      upsertConsentLog,
      insertTranscript,
      lookupServiceValue,
      updateBookingRecoveredRevenue,
      resolveTenantByAgent,
      upsertConversation,
      findBookingIdByConversation,
    },
  };
}

function makePayload(overrides: {
  consentDecision: "yes" | "no" | "ambiguous";
  consentFlag: boolean;
  appointmentCategory?: "consultation" | "complex_service";
  transcriptTurns?: number;
}) {
  return {
    conversationId: "conv-9",
    agentId: "agent-77",
    startedAt: "2026-05-16T13:00:00.000Z",
    endedAt: "2026-05-16T13:05:00.000Z",
    durationSeconds: 300,
    endReason: "caller_hangup",
    direction: "inbound" as const,
    transcript: Array.from({ length: overrides.transcriptTurns ?? 4 }, (_, i) => ({
      role: i % 2 === 0 ? "agent" : "user",
      text: `turn ${i}`,
      startMs: i * 1000,
      endMs: i * 1000 + 800,
    })),
    toolInvocations: [],
    derived: {
      callerLanguage: "pl",
      consentDecision: overrides.consentDecision,
      consentFlag: overrides.consentFlag,
      ...(overrides.appointmentCategory
        ? { appointmentCategory: overrides.appointmentCategory }
        : {}),
      escalated: false,
    },
  };
}

describe("handlePostCall (W2.4)", () => {
  it("stores transcript when consent=yes", async () => {
    const { repo, spies } = buildRepo();
    const out = await handlePostCall(makePayload({ consentDecision: "yes", consentFlag: true }), {
      repo,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.consentLogged).toBe(true);
    expect(out.transcriptStored).toBe(true);
    expect(spies.upsertConsentLog).toHaveBeenCalledOnce();
    expect(spies.insertTranscript).toHaveBeenCalledOnce();
    const ins = spies.insertTranscript.mock.calls[0]![0] as InsertTranscriptArgs;
    expect(ins.turns).toHaveLength(4);
    expect(ins.conversationId).toBe("conv-9");
  });

  it("does NOT store transcript when consent=no", async () => {
    const { repo, spies } = buildRepo();
    const out = await handlePostCall(makePayload({ consentDecision: "no", consentFlag: false }), {
      repo,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.transcriptStored).toBe(false);
    expect(spies.upsertConsentLog).toHaveBeenCalledOnce();
    expect(spies.insertTranscript).not.toHaveBeenCalled();
  });

  it("does NOT store transcript when consent=ambiguous (default-deny)", async () => {
    const { repo, spies } = buildRepo();
    const out = await handlePostCall(
      makePayload({ consentDecision: "ambiguous", consentFlag: false }),
      { repo },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.transcriptStored).toBe(false);
    expect(spies.insertTranscript).not.toHaveBeenCalled();
  });

  it("ignores derived.consentFlag if it disagrees with derived.consentDecision (decision wins)", async () => {
    // Adversarial: classifier reported decision=no but consentFlag=true. Decision wins.
    const { repo, spies } = buildRepo();
    await handlePostCall(makePayload({ consentDecision: "no", consentFlag: true }), { repo });
    expect(spies.insertTranscript).not.toHaveBeenCalled();
    const consentArgs = spies.upsertConsentLog.mock.calls[0]![0] as InsertConsentLogArgs;
    expect(consentArgs.consentFlag).toBe(false);
  });

  it("computes recovered_revenue = expected_revenue × show_rate, rounded 2dp", async () => {
    const { repo, spies } = buildRepo({
      async lookupServiceValue() {
        return { expectedRevenuePln: 250, showRate: 0.7 };
      },
    });
    const out = await handlePostCall(
      makePayload({
        consentDecision: "yes",
        consentFlag: true,
        appointmentCategory: "consultation",
      }),
      { repo },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recoveredRevenuePln).toBe(175);
    const updateArgs = spies.updateBookingRecoveredRevenue.mock
      .calls[0]![0] as UpdateBookingRevenueArgs;
    expect(updateArgs.recoveredRevenuePln).toBe(175);
    expect(updateArgs.conversationId).toBe("conv-9");
  });

  it("skips revenue update when matrix has no entry", async () => {
    const { repo, spies } = buildRepo();
    const out = await handlePostCall(
      makePayload({
        consentDecision: "yes",
        consentFlag: true,
        appointmentCategory: "consultation",
      }),
      { repo },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recoveredRevenuePln).toBeNull();
    expect(spies.updateBookingRecoveredRevenue).not.toHaveBeenCalled();
  });

  it("rejects with 400 when payload is invalid", async () => {
    const { repo } = buildRepo();
    const out = await handlePostCall({ wrong: "shape" }, { repo });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
  });

  it("rejects with 404 when agentId is unknown", async () => {
    const { repo } = buildRepo();
    const payload = makePayload({ consentDecision: "yes", consentFlag: true });
    payload.agentId = "agent-unknown";
    const out = await handlePostCall(payload, { repo });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(404);
  });

  it("doesn't store empty transcripts even when consent=yes", async () => {
    const { repo, spies } = buildRepo();
    await handlePostCall(
      makePayload({
        consentDecision: "yes",
        consentFlag: true,
        transcriptTurns: 0,
      }),
      { repo },
    );
    expect(spies.insertTranscript).not.toHaveBeenCalled();
  });
});

describe("handlePostCall (W2.5) — conversations write", () => {
  function basePayload() {
    return {
      conversationId: "conv-c1",
      agentId: "agent-77",
      startedAt: "2026-05-21T10:00:00.000Z",
      endedAt: "2026-05-21T10:02:00.000Z",
      durationSeconds: 120,
      endReason: "hangup_caller",
      direction: "inbound" as const,
      transcript: [
        { role: "user", text: "Cześć", startMs: 0, endMs: 800 },
        { role: "agent", text: "Dzień dobry", startMs: 900, endMs: 1700 },
      ],
      toolInvocations: [
        {
          toolName: "check_availability",
          argsJson: "{}",
          responseJson: "{}",
          latencyMs: 412,
          succeeded: true,
        },
      ],
      derived: {
        callerLanguage: "pl" as const,
        consentDecision: "yes" as const,
        consentFlag: true,
        escalated: false,
      },
    };
  }

  it("PSTN with consent=true writes conversations row with transcript in raw_jsonb", async () => {
    const { repo, spies } = buildRepo();
    const r = await handlePostCall(basePayload(), { repo });
    expect(r.ok).toBe(true);
    expect(spies.upsertConversation).toHaveBeenCalledOnce();
    const args = spies.upsertConversation.mock.calls[0]![0] as UpsertConversationArgs;
    expect(args.conversationId).toBe("conv-c1");
    expect(args.tenantId).toBe("tenant-1");
    expect(args.agentId).toBe("agent-row-1");
    expect(args.providerAgentId).toBe("agent-77");
    expect(args.source).toBe("pstn");
    expect(args.direction).toBe("inbound");
    expect(args.consentFlag).toBe(true);
    expect(args.consentDecision).toBe("yes");
    expect(args.callerLanguage).toBe("pl");
    expect(args.toolCallCount).toBe(1);
    expect(args.toolErrorCount).toBe(0);
    expect(args.escalated).toBe(false);
    expect((args.rawJsonb as { transcript?: unknown[] }).transcript).toHaveLength(2);
    expect(args.finalizedAt).toBeTruthy();
  });

  it("PSTN with consent=false strips transcript from raw_jsonb (consent gate)", async () => {
    const { repo, spies } = buildRepo();
    const w = basePayload();
    w.derived = { ...w.derived, consentDecision: "no", consentFlag: false };
    await handlePostCall(w, { repo });
    const args = spies.upsertConversation.mock.calls[0]![0] as UpsertConversationArgs;
    expect(args.consentFlag).toBe(false);
    expect((args.rawJsonb as { transcript?: unknown[] }).transcript).toBeUndefined();
  });

  it("tool_error_count counts succeeded=false entries", async () => {
    const { repo, spies } = buildRepo();
    const w = basePayload();
    w.toolInvocations = [
      {
        toolName: "create_booking",
        argsJson: "{}",
        responseJson: "{}",
        latencyMs: 800,
        succeeded: false,
      },
      {
        toolName: "check_availability",
        argsJson: "{}",
        responseJson: "{}",
        latencyMs: 200,
        succeeded: true,
      },
    ];
    await handlePostCall(w, { repo });
    const args = spies.upsertConversation.mock.calls[0]![0] as UpsertConversationArgs;
    expect(args.toolCallCount).toBe(2);
    expect(args.toolErrorCount).toBe(1);
  });
});

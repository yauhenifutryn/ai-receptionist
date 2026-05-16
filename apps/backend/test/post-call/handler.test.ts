import { describe, it, expect, vi } from "vitest";
import { handlePostCall } from "../../src/post-call/handler.js";
import type {
  PostCallRepository,
  InsertConsentLogArgs,
  InsertTranscriptArgs,
  ServiceValueLookupArgs,
  ServiceValueLookupResult,
  UpdateBookingRevenueArgs,
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
  };
} {
  const upsertConsentLog = vi.fn(async (_args: InsertConsentLogArgs) => {});
  const insertTranscript = vi.fn(async (_args: InsertTranscriptArgs) => {});
  const lookupServiceValue = vi.fn(
    async (_args: ServiceValueLookupArgs): Promise<ServiceValueLookupResult | null> =>
      null,
  );
  const updateBookingRecoveredRevenue = vi.fn(
    async (_args: UpdateBookingRevenueArgs) => {},
  );
  const resolveTenantByAgent = vi.fn(async (id: string): Promise<TenantBinding | null> =>
    id === "agent-77" ? { tenantId: "tenant-1", agentRowId: "agent-row-1" } : null,
  );

  const repo: PostCallRepository = {
    resolveTenantByAgent,
    upsertConsentLog,
    insertTranscript,
    lookupServiceValue,
    updateBookingRecoveredRevenue,
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
    const out = await handlePostCall(
      makePayload({ consentDecision: "yes", consentFlag: true }),
      { repo },
    );
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
    const out = await handlePostCall(
      makePayload({ consentDecision: "no", consentFlag: false }),
      { repo },
    );
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
    await handlePostCall(
      makePayload({ consentDecision: "no", consentFlag: true }),
      { repo },
    );
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
    const updateArgs = spies.updateBookingRecoveredRevenue.mock.calls[0]![0] as UpdateBookingRevenueArgs;
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

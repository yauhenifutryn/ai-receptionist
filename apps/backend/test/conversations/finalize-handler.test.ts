import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFinalizeConversation } from "../../src/conversations/finalize-handler.js";
import type { PostCallRepository } from "../../src/post-call/repository.js";

/**
 * EL response shape verified by Wave 0 probe (2026-05-20):
 *  - tool_calls/tool_results are nested per-turn at transcript[i], NOT
 *    top-level
 *  - metadata.main_language is the language field
 *  - turn fields are `message` and `time_in_call_secs` (not text/startMs)
 *
 * The handler walks transcript turns to count tools and flattens them
 * into rawJsonb.toolInvocations for UI symmetry with PSTN.
 */
const okElBody = {
  conversation_id: "c1",
  transcript: [
    {
      role: "user",
      message: "hi",
      tool_calls: [],
      tool_results: [],
      time_in_call_secs: 0,
    },
    {
      role: "agent",
      message: "checking",
      tool_calls: [
        {
          tool_name: "check_availability",
          request_id: "r1",
          params_as_json: "{}",
          type: "client",
        },
      ],
      tool_results: [
        {
          tool_name: "check_availability",
          request_id: "r1",
          result_value: "{}",
          is_error: false,
        },
      ],
      time_in_call_secs: 1,
    },
  ],
  metadata: {
    start_time_unix_secs: 1716285600,
    call_duration_secs: 90,
    termination_reason: "hangup_caller",
    main_language: "pl",
  },
};

type RepoSubset = Pick<
  PostCallRepository,
  "resolveTenantByAgent" | "upsertConversation" | "findBookingIdByConversation" | "resolveAgentPin"
>;

function makeRepo(): RepoSubset {
  return {
    resolveTenantByAgent: vi
      .fn()
      .mockResolvedValue({ tenantId: "t1", agentRowId: "a1" }),
    upsertConversation: vi.fn().mockResolvedValue(undefined),
    findBookingIdByConversation: vi.fn().mockResolvedValue(null),
    resolveAgentPin: vi.fn().mockResolvedValue("4242"),
  };
}

describe("handleFinalizeConversation", () => {
  let repo: RepoSubset;
  beforeEach(() => {
    repo = makeRepo();
  });

  it("operator + browser_test writes conversations row mapped from EL payload", async () => {
    const fetchEl = vi.fn().mockResolvedValue({ ok: true, body: okElBody });
    const r = await handleFinalizeConversation(
      { conversationId: "c1", agentId: "agent_x", source: "browser_test" },
      { isOperator: true, pinMatchAgentId: null, fetchEl, repo },
    );
    expect(r.ok).toBe(true);
    const upsertMock = repo.upsertConversation as unknown as ReturnType<typeof vi.fn>;
    expect(upsertMock).toHaveBeenCalled();
    const args = upsertMock.mock.calls.at(-1)![0];
    expect(args.source).toBe("browser_test");
    expect(args.durationSeconds).toBe(90);
    expect(args.endReason).toBe("hangup_caller");
    expect(args.callerLanguage).toBe("pl");
    // tool_calls nested per-turn → flatten yields 1
    expect(args.toolCallCount).toBe(1);
    expect(args.toolErrorCount).toBe(0);
    // toolInvocations normalized into rawJsonb for UI symmetry with PSTN
    expect(Array.isArray((args.rawJsonb as { toolInvocations?: unknown[] }).toolInvocations)).toBe(
      true,
    );
    expect((args.rawJsonb as { toolInvocations: unknown[] }).toolInvocations).toHaveLength(1);
  });

  it("pin_demo with wrong PIN is rejected with 403", async () => {
    const fetchEl = vi.fn().mockResolvedValue({ ok: true, body: okElBody });
    const r = await handleFinalizeConversation(
      { conversationId: "c1", agentId: "agent_x", source: "pin_demo", pin: "wrong" },
      { isOperator: false, pinMatchAgentId: "agent_x", fetchEl, repo },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("browser_test without operator session is rejected with 401", async () => {
    const fetchEl = vi.fn();
    const r = await handleFinalizeConversation(
      { conversationId: "c1", agentId: "agent_x", source: "browser_test" },
      { isOperator: false, pinMatchAgentId: null, fetchEl, repo },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
    expect(fetchEl).not.toHaveBeenCalled();
  });

  it("extracts caller_phone_e164 from EL metadata.phone_call.from_phone_number", async () => {
    const bodyWithPhone = {
      ...okElBody,
      metadata: {
        ...okElBody.metadata,
        phone_call: { from_phone_number: "+48555000111" },
      },
    };
    const fetchEl = vi.fn().mockResolvedValue({ ok: true, body: bodyWithPhone });
    const r = await handleFinalizeConversation(
      { conversationId: "c1", agentId: "agent_x", source: "browser_test" },
      { isOperator: true, pinMatchAgentId: null, fetchEl, repo },
    );
    expect(r.ok).toBe(true);
    const upsertMock = repo.upsertConversation as unknown as ReturnType<typeof vi.fn>;
    const args = upsertMock.mock.calls.at(-1)![0];
    expect(args.callerPhoneE164).toBe("+48555000111");
  });

  it("EL 404 still writes a stub row and returns ok=true", async () => {
    const fetchEl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, message: "" });
    const r = await handleFinalizeConversation(
      { conversationId: "c1", agentId: "agent_x", source: "browser_test" },
      { isOperator: true, pinMatchAgentId: null, fetchEl, repo },
    );
    expect(r.ok).toBe(true);
    const upsertMock = repo.upsertConversation as unknown as ReturnType<typeof vi.fn>;
    const args = upsertMock.mock.calls.at(-1)![0];
    expect(args.rawJsonb).toBeNull();
    expect(args.finalizedAt).toBeNull();
  });
});

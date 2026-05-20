import type { FinalizeConversationRequest } from "@ai-receptionist/contracts";
import type { PostCallRepository } from "../post-call/repository.js";
import type { FetchConversationResult } from "../integrations/elevenlabs/conversation.js";

/**
 * Pure handler for POST /api/conversations/finalize.
 *
 * Lives in apps/backend so it can be unit-tested with vitest. The Next.js
 * route at apps/web/app/api/conversations/finalize/route.ts is a thin
 * adapter that injects the auth context, EL fetcher, and Supabase repo.
 *
 * Flow:
 *  1. Authorize: operator session for browser_test; PIN match for pin_demo.
 *  2. Resolve tenant via provider_agent_id.
 *  3. Fetch canonical EL record. On success, map to conversations row; on
 *     failure (timeout/404/network) persist a stub row so the list view can
 *     still render and a later retry can hydrate it.
 *
 * EL response shape (verified by Wave 0 probe 2026-05-20):
 *  - tool_calls/tool_results live PER-TURN at transcript[i], not top-level
 *  - metadata.main_language is the language field
 *  - turn fields are `message` and `time_in_call_secs`
 *
 * We flatten tool_calls across turns into rawJsonb.toolInvocations so the
 * UI can treat them like PSTN's flat PostCallWebhookSchema.toolInvocations[].
 */
export interface FinalizeDeps {
  isOperator: boolean;
  /**
   * If the request claims source=pin_demo, this is the agentId the PIN was
   * validated against. The handler still re-checks the PIN against the repo
   * to defend against tampered requests.
   */
  pinMatchAgentId: string | null;
  /**
   * When true, skip the auth gates (PIN match, operator session). Reserved for
   * server-side lazy-retry paths that already authenticated upstream. Never
   * pass true based on user input.
   */
  bypassAuthCheck?: boolean;
  fetchEl: (args: { conversationId: string }) => Promise<FetchConversationResult>;
  repo: Pick<
    PostCallRepository,
    | "resolveTenantByAgent"
    | "upsertConversation"
    | "findBookingIdByConversation"
    | "resolveAgentPin"
  >;
}

export type FinalizeResult = { ok: true } | { ok: false; status: number; error: string };

export async function handleFinalizeConversation(
  req: FinalizeConversationRequest,
  deps: FinalizeDeps,
): Promise<FinalizeResult> {
  // 1. Auth gate (bypassable for server-side lazy retry; see FinalizeDeps).
  if (!deps.bypassAuthCheck) {
    if (req.source === "pin_demo") {
      if (!req.pin) return { ok: false, status: 400, error: "pin_required" };
      const expected = await deps.repo.resolveAgentPin(req.agentId);
      if (!expected || expected !== req.pin) {
        return { ok: false, status: 403, error: "pin_mismatch" };
      }
    } else if (req.source === "browser_test") {
      if (!deps.isOperator) {
        return { ok: false, status: 401, error: "operator_required" };
      }
    } else {
      // PSTN is handled by the post-call webhook, never via this route.
      return { ok: false, status: 400, error: "invalid_source" };
    }
  }

  // 2. Resolve tenant.
  const tenant = await deps.repo.resolveTenantByAgent(req.agentId);
  if (!tenant) {
    return { ok: false, status: 404, error: "tenant_not_found" };
  }

  // 3. Fetch EL canonical record.
  const el = await deps.fetchEl({ conversationId: req.conversationId });

  // 4. Map → upsert.
  if (el.ok) {
    const body = el.body;
    const meta = (body.metadata ?? {}) as Record<string, unknown>;
    const startUnix =
      typeof meta.start_time_unix_secs === "number" ? meta.start_time_unix_secs : null;
    const durationSecs =
      typeof meta.call_duration_secs === "number" ? meta.call_duration_secs : null;
    const startedAt = startUnix
      ? new Date(startUnix * 1000).toISOString()
      : new Date().toISOString();
    const endedAt =
      startUnix && durationSecs
        ? new Date((startUnix + durationSecs) * 1000).toISOString()
        : null;

    // EL nests tool_calls per-turn in transcript[]. Flatten so UI + analytics
    // can treat them like the flat PostCallWebhookSchema.toolInvocations[].
    // Verified by Wave 0 probe — top-level body.tool_calls does not exist.
    type ElTurn = {
      tool_calls?: unknown[];
      tool_results?: Array<{ is_error?: boolean }>;
    };
    const turns: ElTurn[] = Array.isArray(body.transcript) ? (body.transcript as ElTurn[]) : [];
    const flatToolCalls = turns.flatMap((t) => (Array.isArray(t.tool_calls) ? t.tool_calls : []));
    const flatToolResults = turns.flatMap((t) =>
      Array.isArray(t.tool_results) ? t.tool_results : [],
    );
    const toolErrorCount = flatToolResults.filter((r) => r && r.is_error === true).length;
    const language =
      (meta.main_language as string | undefined) ??
      (meta.language as string | undefined) ??
      null;

    // EL exposes the PSTN caller line at metadata.phone_call.from_phone_number
    // (E.164). Absent for browser/PIN sessions; we still extract opportunistically
    // because the finalize endpoint hydrates *all* sources.
    const phoneCallMeta = (meta.phone_call ?? null) as
      | { from_phone_number?: unknown }
      | null;
    const callerPhoneCandidate = phoneCallMeta?.from_phone_number;
    const callerPhoneE164 =
      typeof callerPhoneCandidate === "string" && callerPhoneCandidate.length > 0
        ? callerPhoneCandidate
        : null;

    const bookedBookingId = await deps.repo.findBookingIdByConversation(req.conversationId);

    await deps.repo.upsertConversation({
      conversationId: req.conversationId,
      tenantId: tenant.tenantId,
      agentId: tenant.agentRowId,
      providerAgentId: req.agentId,
      source: req.source,
      direction: null,
      startedAt,
      endedAt,
      durationSeconds: durationSecs,
      endReason: (meta.termination_reason as string | undefined) ?? null,
      consentFlag: null,
      callerLanguage: language,
      escalated: false,
      bookedBookingId,
      toolCallCount: flatToolCalls.length,
      toolErrorCount,
      // Persist EL body verbatim AND a normalized toolInvocations[] alongside
      // for UI symmetry with PSTN's PostCallWebhookSchema.toolInvocations.
      rawJsonb: { ...body, toolInvocations: flatToolCalls },
      finalizedAt: new Date().toISOString(),
      callerPhoneE164,
    });
    return { ok: true };
  }

  // EL failed: persist a stub row so the list view can render and a future
  // retry can hydrate raw_jsonb. finalized_at left null so retries can find it.
  await deps.repo.upsertConversation({
    conversationId: req.conversationId,
    tenantId: tenant.tenantId,
    agentId: tenant.agentRowId,
    providerAgentId: req.agentId,
    source: req.source,
    direction: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
    endReason: null,
    consentFlag: null,
    escalated: false,
    bookedBookingId: null,
    toolCallCount: 0,
    toolErrorCount: 0,
    rawJsonb: null,
    finalizedAt: null,
  });
  return { ok: true };
}

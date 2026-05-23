import { PostCallWebhookSchema, type PostCallWebhook } from "@ai-receptionist/contracts";
import type { PostCallRepository } from "./repository.js";

export interface HandlePostCallDeps {
  repo: PostCallRepository;
}

export type HandlePostCallResult =
  | {
      ok: true;
      tenantId: string;
      consentLogged: boolean;
      transcriptStored: boolean;
      recoveredRevenuePln: number | null;
    }
  | { ok: false; status: number; error: string };

export async function handlePostCall(
  raw: unknown,
  deps: HandlePostCallDeps,
): Promise<HandlePostCallResult> {
  const parsed = PostCallWebhookSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "validation_failed" };
  }
  const payload: PostCallWebhook = parsed.data;

  const tenant = await deps.repo.resolveTenantByAgent(payload.agentId);
  if (!tenant) {
    return { ok: false, status: 404, error: "tenant_not_found" };
  }

  const consentFlag = payload.derived.consentDecision === "yes";

  // Three independent chains run in parallel:
  //   1. consent_log upsert -> transcript insert (transcript trigger requires the consent row)
  //   2. service_value lookup -> booking revenue update
  //   3. booking-id find
  // upsertConversation runs after all three because it needs the booking id.
  const consentChain = (async () => {
    await deps.repo.upsertConsentLog({
      tenantId: tenant.tenantId,
      agentRowId: tenant.agentRowId,
      conversationId: payload.conversationId,
      callerLanguage: payload.derived.callerLanguage,
      decision: payload.derived.consentDecision,
      consentFlag,
      classifierConfidence: 1,
    });
    if (consentFlag && payload.transcript.length > 0) {
      await deps.repo.insertTranscript({
        tenantId: tenant.tenantId,
        conversationId: payload.conversationId,
        turns: payload.transcript,
      });
      return { transcriptStored: true };
    }
    return { transcriptStored: false };
  })();

  const revenueChain = (async () => {
    if (!payload.derived.appointmentCategory) return { recoveredRevenuePln: null as number | null };
    const matrix = await deps.repo.lookupServiceValue({
      tenantId: tenant.tenantId,
      category: payload.derived.appointmentCategory,
    });
    if (!matrix) return { recoveredRevenuePln: null as number | null };
    const recoveredRevenuePln = Number((matrix.expectedRevenuePln * matrix.showRate).toFixed(2));
    await deps.repo.updateBookingRecoveredRevenue({
      conversationId: payload.conversationId,
      recoveredRevenuePln,
    });
    return { recoveredRevenuePln };
  })();

  const bookingChain = deps.repo.findBookingIdByConversation(payload.conversationId);

  const [{ transcriptStored }, { recoveredRevenuePln }, bookedBookingId] = await Promise.all([
    consentChain,
    revenueChain,
    bookingChain,
  ]);

  const transcriptForJsonb = consentFlag ? payload.transcript : undefined;

  // EL shape varies depending on which webhook variant fired; check both
  // payload.raw.phone_call.from_phone_number and the nested
  // payload.raw.metadata.phone_call.from_phone_number. PSTN-only field.
  const rawRecord = (payload.raw ?? {}) as Record<string, unknown>;
  const rawPhoneCall = (rawRecord.phone_call ?? null) as { from_phone_number?: unknown } | null;
  const rawMetadata = (rawRecord.metadata ?? null) as {
    phone_call?: { from_phone_number?: unknown };
  } | null;
  const phoneCandidate =
    rawPhoneCall?.from_phone_number ?? rawMetadata?.phone_call?.from_phone_number ?? null;
  const callerPhoneE164 =
    typeof phoneCandidate === "string" && phoneCandidate.length > 0 ? phoneCandidate : null;

  await deps.repo.upsertConversation({
    conversationId: payload.conversationId,
    tenantId: tenant.tenantId,
    agentId: tenant.agentRowId,
    providerAgentId: payload.agentId,
    source: "pstn",
    direction: payload.direction,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationSeconds: payload.durationSeconds,
    endReason: payload.endReason,
    consentFlag,
    consentDecision: payload.derived.consentDecision,
    callerLanguage: payload.derived.callerLanguage,
    appointmentCategory: payload.derived.appointmentCategory ?? null,
    escalated: payload.derived.escalated,
    escalationReason: payload.derived.escalationReason ?? null,
    bookedBookingId,
    toolCallCount: payload.toolInvocations.length,
    toolErrorCount: payload.toolInvocations.filter((t) => !t.succeeded).length,
    rawJsonb: {
      transcript: transcriptForJsonb,
      toolInvocations: payload.toolInvocations,
      derived: payload.derived,
      raw: payload.raw,
    },
    finalizedAt: new Date().toISOString(),
    callerPhoneE164,
  });

  return {
    ok: true,
    tenantId: tenant.tenantId,
    consentLogged: true,
    transcriptStored,
    recoveredRevenuePln,
  };
}

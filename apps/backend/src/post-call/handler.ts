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

  // Consent log: ALWAYS written. consent_flag must match (decision === 'yes').
  const consentFlag = payload.derived.consentDecision === "yes";
  await deps.repo.upsertConsentLog({
    tenantId: tenant.tenantId,
    agentRowId: tenant.agentRowId,
    conversationId: payload.conversationId,
    callerLanguage: payload.derived.callerLanguage,
    decision: payload.derived.consentDecision,
    consentFlag,
    classifierConfidence: 1,
  });

  // Transcript: gated on consent. DB trigger enforces too — belt + suspenders.
  let transcriptStored = false;
  if (consentFlag && payload.transcript.length > 0) {
    await deps.repo.insertTranscript({
      tenantId: tenant.tenantId,
      conversationId: payload.conversationId,
      turns: payload.transcript,
    });
    transcriptStored = true;
  }

  // Revenue: computed only when we have an appointmentCategory.
  let recoveredRevenuePln: number | null = null;
  if (payload.derived.appointmentCategory) {
    const matrix = await deps.repo.lookupServiceValue({
      tenantId: tenant.tenantId,
      category: payload.derived.appointmentCategory,
    });
    if (matrix) {
      recoveredRevenuePln = Number((matrix.expectedRevenuePln * matrix.showRate).toFixed(2));
      await deps.repo.updateBookingRecoveredRevenue({
        conversationId: payload.conversationId,
        recoveredRevenuePln,
      });
    }
  }

  return {
    ok: true,
    tenantId: tenant.tenantId,
    consentLogged: true,
    transcriptStored,
    recoveredRevenuePln,
  };
}

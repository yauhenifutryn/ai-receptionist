import { z } from "zod";

/**
 * ConsentFlag — RODO-driven gate on transcript storage.
 *
 * Determined deterministically at the agent's first turn after the consent
 * question is asked (script in `apps/backend/ontology/consent.md`).
 *
 * Hard rule: ambiguous classifier output defaults `consent_flag = false`.
 */
export const ConsentDecisionSchema = z.enum(["yes", "no", "ambiguous"]);
export type ConsentDecision = z.infer<typeof ConsentDecisionSchema>;

export const ConsentClassifierResultSchema = z.object({
  decision: ConsentDecisionSchema,
  confidence: z.number().min(0).max(1),
  /** Verbatim caller utterance after the consent question (PII — handle with redaction). */
  utterance: z.string(),
  language: z.enum(["pl", "en", "ru"]),
});
export type ConsentClassifierResult = z.infer<typeof ConsentClassifierResultSchema>;

/**
 * Persisted per-call regardless of decision (audit). The boolean `consentFlag`
 * is the gate consumed by `post-call-webhook` to decide whether to store the
 * transcript.
 */
export const ConsentLogEntrySchema = z.object({
  conversationId: z.string(),
  tenantId: z.string().uuid(),
  agentId: z.string(),
  callerLanguage: z.enum(["pl", "en", "ru"]),
  decision: ConsentDecisionSchema,
  consentFlag: z.boolean(),
  classifierConfidence: z.number().min(0).max(1),
  recordedAt: z.string().datetime(),
});
export type ConsentLogEntry = z.infer<typeof ConsentLogEntrySchema>;

import { z } from "zod";
import { AppointmentCategorySchema } from "./appointment-category.enum.js";
import { ConsentDecisionSchema } from "./consent-flag.schema.js";

/**
 * PostCallWebhook — payload ElevenLabs ConvAI POSTs to our `/webhooks/post-call`
 * endpoint when a conversation ends.
 *
 * Conservatively typed: anything ElevenLabs may add over time is captured by
 * `passthrough()` so we don't break on field additions.
 *
 * The webhook handler MUST:
 *   1. Validate the payload against this schema.
 *   2. Store transcript ONLY if `consentFlag === true` (RODO gate).
 *   3. Resolve `tenantId` from `agentId`, then write a `bookings` row.
 *   4. Compute `recoveredRevenue` from `appointmentCategory × service_value_matrix`.
 *   5. Never write PII (`patientPhone`, `patientName`, raw transcript) to logs.
 */

export const PostCallTranscriptTurnSchema = z
  .object({
    role: z.enum(["agent", "user", "system"]),
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .passthrough();
export type PostCallTranscriptTurn = z.infer<typeof PostCallTranscriptTurnSchema>;

export const PostCallToolInvocationSchema = z
  .object({
    toolName: z.string(),
    requestId: z.string().uuid().optional(),
    /** JSON-stringified args (so we don't have to model every tool here). */
    argsJson: z.string(),
    /** JSON-stringified response. */
    responseJson: z.string(),
    latencyMs: z.number().int().nonnegative(),
    succeeded: z.boolean(),
  })
  .passthrough();
export type PostCallToolInvocation = z.infer<typeof PostCallToolInvocationSchema>;

/** Our own derivation, written by the agent's classifier mid-call into a metadata field. */
export const PostCallDerivedMetadataSchema = z
  .object({
    callerLanguage: z.enum(["pl", "en", "ru"]).default("pl"),
    consentDecision: ConsentDecisionSchema.default("ambiguous"),
    /** Boolean gate consumed by storage rules. Must equal (consentDecision === 'yes'). */
    consentFlag: z.boolean().default(false),
    /** Categorical classifier output; informs revenue math. */
    appointmentCategory: AppointmentCategorySchema.optional(),
    /** True if the agent escalated; populated when an escalation script fired. */
    escalated: z.boolean().default(false),
    escalationReason: z.string().optional(),
  })
  .strict();
export type PostCallDerivedMetadata = z.infer<typeof PostCallDerivedMetadataSchema>;

export const PostCallWebhookSchema = z
  .object({
    /** ElevenLabs conversation identifier. */
    conversationId: z.string(),
    /** Agent identifier — used to resolve our tenantId via the agents table. */
    agentId: z.string(),
    /** ISO 8601. */
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    durationSeconds: z.number().nonnegative(),
    /** ElevenLabs end reason (caller hung up, agent ended, error, etc.). */
    endReason: z.string(),
    /** Whether the call was inbound or outbound — drives different downstream flows. */
    direction: z.enum(["inbound", "outbound"]).default("inbound"),
    transcript: z.array(PostCallTranscriptTurnSchema).default([]),
    toolInvocations: z.array(PostCallToolInvocationSchema).default([]),
    /** Metadata our agent's classifiers wrote during the call. */
    derived: PostCallDerivedMetadataSchema,
    /** ElevenLabs may add fields; preserve them. */
    raw: z.record(z.unknown()).optional(),
  })
  .strict();
export type PostCallWebhook = z.infer<typeof PostCallWebhookSchema>;

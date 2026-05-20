import { z } from "zod";

export const ConversationSourceSchema = z.enum(["pstn", "browser_test", "pin_demo"]);
export type ConversationSource = z.infer<typeof ConversationSourceSchema>;

export const ConversationDirectionSchema = z.enum(["inbound", "outbound"]);
export type ConversationDirection = z.infer<typeof ConversationDirectionSchema>;

export const FinalizeConversationRequestSchema = z
  .object({
    conversationId: z.string().min(1).max(160),
    agentId: z.string().min(1).max(160),
    source: ConversationSourceSchema,
    pin: z.string().min(3).max(8).optional(),
  })
  .refine((v) => v.source !== "pin_demo" || !!v.pin, {
    message: "pin is required when source=pin_demo",
    path: ["pin"],
  });
export type FinalizeConversationRequest = z.infer<typeof FinalizeConversationRequestSchema>;

const truthy = (v: unknown) => v === "1" || v === "true" || v === true;

export const ListConversationsQuerySchema = z.object({
  agentId: z.string().optional(),
  pin: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  source: ConversationSourceSchema.optional(),
  bookedOnly: z.preprocess(truthy, z.boolean()).optional(),
  includeBrowserTest: z.preprocess(truthy, z.boolean()).optional(),
  language: z.enum(["pl", "en", "ru"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;

export const ConversationRowSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string(),
  tenantId: z.string().uuid(),
  agentId: z.string().uuid().nullable().optional(),
  providerAgentId: z.string(),
  source: ConversationSourceSchema,
  direction: ConversationDirectionSchema.nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  endReason: z.string().nullable().optional(),
  consentFlag: z.boolean().nullable().optional(),
  consentDecision: z.string().nullable().optional(),
  callerLanguage: z.string().nullable().optional(),
  appointmentCategory: z.string().nullable().optional(),
  escalated: z.boolean(),
  escalationReason: z.string().nullable().optional(),
  bookedBookingId: z.string().uuid().nullable().optional(),
  toolCallCount: z.number().int(),
  toolErrorCount: z.number().int(),
  rawJsonb: z.unknown().optional(),
  finalizedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConversationRow = z.infer<typeof ConversationRowSchema>;

import type { AppointmentCategory, PostCallTranscriptTurn } from "@ai-receptionist/contracts";
import type { TenantBinding } from "../tools/repository.js";

export interface InsertConsentLogArgs {
  tenantId: string;
  agentRowId: string;
  conversationId: string;
  callerLanguage: "pl" | "en" | "ru";
  decision: "yes" | "no" | "ambiguous";
  consentFlag: boolean;
  classifierConfidence: number;
}

export interface InsertTranscriptArgs {
  tenantId: string;
  conversationId: string;
  turns: PostCallTranscriptTurn[];
}

export interface UpdateBookingRevenueArgs {
  conversationId: string;
  recoveredRevenuePln: number;
}

export interface ServiceValueLookupArgs {
  tenantId: string;
  category: AppointmentCategory;
}

export interface ServiceValueLookupResult {
  expectedRevenuePln: number;
  showRate: number;
}

export interface UpsertConversationArgs {
  conversationId: string;
  tenantId: string;
  agentId: string | null;
  providerAgentId: string;
  source: "pstn" | "browser_test" | "pin_demo";
  direction?: "inbound" | "outbound" | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  endReason?: string | null;
  consentFlag?: boolean | null;
  consentDecision?: string | null;
  callerLanguage?: string | null;
  appointmentCategory?: string | null;
  escalated?: boolean;
  escalationReason?: string | null;
  bookedBookingId?: string | null;
  toolCallCount?: number;
  toolErrorCount?: number;
  rawJsonb?: unknown;
  finalizedAt?: string | null;
  /**
   * E.164 caller number, extracted from EL metadata.phone_call.from_phone_number.
   * Set only for PSTN; null for browser_test / pin_demo (no caller line).
   */
  callerPhoneE164?: string | null;
}

export interface PostCallRepository {
  resolveTenantByAgent(providerAgentId: string): Promise<TenantBinding | null>;
  upsertConsentLog(args: InsertConsentLogArgs): Promise<void>;
  insertTranscript(args: InsertTranscriptArgs): Promise<void>;
  /** Returns null if the tenant has no matrix entry for this category. */
  lookupServiceValue(args: ServiceValueLookupArgs): Promise<ServiceValueLookupResult | null>;
  /** Updates the bookings row keyed by conversation_id with the computed revenue. */
  updateBookingRecoveredRevenue(args: UpdateBookingRevenueArgs): Promise<void>;
  /** Writes/updates the canonical conversations row for any source (PSTN/browser/PIN). */
  upsertConversation(args: UpsertConversationArgs): Promise<void>;
  /** Returns the bookings.id linked to this conversation_id, or null. */
  findBookingIdByConversation(conversationId: string): Promise<string | null>;
  /** Returns the agents.pin_code for a provider_agent_id, or null. Used by finalize-handler PIN gate. */
  resolveAgentPin(providerAgentId: string): Promise<string | null>;
}

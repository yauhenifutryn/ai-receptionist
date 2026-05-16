import type {
  AppointmentCategory,
  PostCallTranscriptTurn,
} from "@ai-receptionist/contracts";
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

export interface PostCallRepository {
  resolveTenantByAgent(providerAgentId: string): Promise<TenantBinding | null>;
  upsertConsentLog(args: InsertConsentLogArgs): Promise<void>;
  insertTranscript(args: InsertTranscriptArgs): Promise<void>;
  /** Returns null if the tenant has no matrix entry for this category. */
  lookupServiceValue(
    args: ServiceValueLookupArgs,
  ): Promise<ServiceValueLookupResult | null>;
  /** Updates the bookings row keyed by conversation_id with the computed revenue. */
  updateBookingRecoveredRevenue(args: UpdateBookingRevenueArgs): Promise<void>;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InsertConsentLogArgs,
  InsertTranscriptArgs,
  PostCallRepository,
  ServiceValueLookupArgs,
  ServiceValueLookupResult,
  UpdateBookingRevenueArgs,
} from "./repository.js";
import type { TenantBinding } from "../tools/repository.js";

export function createSupabasePostCallRepository(client: SupabaseClient): PostCallRepository {
  return {
    async resolveTenantByAgent(providerAgentId: string): Promise<TenantBinding | null> {
      const { data, error } = await client
        .from("agents")
        .select("id, tenant_id")
        .eq("provider_agent_id", providerAgentId)
        .maybeSingle();
      if (error) throw new Error(`agents lookup failed: ${error.message}`);
      if (!data) return null;
      return { tenantId: data.tenant_id, agentRowId: data.id };
    },

    async upsertConsentLog(args: InsertConsentLogArgs): Promise<void> {
      const { error } = await client.from("consent_log").upsert(
        {
          tenant_id: args.tenantId,
          agent_id: args.agentRowId,
          conversation_id: args.conversationId,
          caller_language: args.callerLanguage,
          decision: args.decision,
          consent_flag: args.consentFlag,
          classifier_confidence: args.classifierConfidence,
        },
        { onConflict: "conversation_id" },
      );
      if (error) throw new Error(`consent_log upsert failed: ${error.message}`);
    },

    async insertTranscript(args: InsertTranscriptArgs): Promise<void> {
      const { error } = await client.from("transcripts").insert({
        tenant_id: args.tenantId,
        conversation_id: args.conversationId,
        turns: args.turns,
      });
      if (error) throw new Error(`transcripts insert failed: ${error.message}`);
    },

    async lookupServiceValue(
      args: ServiceValueLookupArgs,
    ): Promise<ServiceValueLookupResult | null> {
      const { data, error } = await client
        .from("service_value_matrix")
        .select("expected_revenue_pln, show_rate")
        .eq("tenant_id", args.tenantId)
        .eq("category", args.category)
        .maybeSingle();
      if (error) throw new Error(`service_value lookup failed: ${error.message}`);
      if (!data) return null;
      return {
        expectedRevenuePln: Number(data.expected_revenue_pln),
        showRate: Number(data.show_rate),
      };
    },

    async updateBookingRecoveredRevenue(args: UpdateBookingRevenueArgs): Promise<void> {
      const { error } = await client
        .from("bookings")
        .update({ recovered_revenue_pln: args.recoveredRevenuePln })
        .eq("conversation_id", args.conversationId);
      if (error) throw new Error(`booking revenue update failed: ${error.message}`);
    },
  };
}

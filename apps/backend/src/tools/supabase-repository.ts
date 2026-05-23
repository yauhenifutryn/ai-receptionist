import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRow, BookingsRepository, InsertBookingArgs } from "./repository.js";
import { resolveTenantByAgent as sharedResolveTenantByAgent } from "../lib/supabase-agent.js";

/**
 * Supabase-backed BookingsRepository. Service-role client only — bypasses RLS
 * because tool webhooks operate outside the user session. Per CLAUDE.md: never
 * log PII; use the redacting logger on every error path.
 */
export function createSupabaseBookingsRepository(client: SupabaseClient): BookingsRepository {
  return {
    resolveTenantByAgent: (providerAgentId: string) =>
      sharedResolveTenantByAgent(client, providerAgentId),

    async findBookingByRequestId(requestId: string): Promise<BookingRow | null> {
      const { data, error } = await client
        .from("bookings")
        .select("id, tenant_id, request_id, short_token, starts_at, ends_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(`bookings lookup failed: ${error.message}`);
      if (!data) return null;
      return {
        id: data.id,
        tenantId: data.tenant_id,
        requestId: data.request_id,
        shortToken: data.short_token,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
      };
    },

    async insertBooking(args: InsertBookingArgs): Promise<BookingRow> {
      const { data, error } = await client
        .from("bookings")
        .insert({
          tenant_id: args.tenantId,
          agent_id: args.agentRowId,
          conversation_id: args.conversationId,
          request_id: args.requestId,
          slot_id: args.slotId,
          external_id: args.externalId,
          short_token: args.shortToken,
          patient_name: args.patientName,
          patient_phone: args.patientPhone,
          appointment_category: args.appointmentCategory,
          starts_at: args.startsAt,
          ends_at: args.endsAt,
          notes: args.notes ?? null,
          status: "booked",
        })
        .select("id, tenant_id, request_id, short_token, starts_at, ends_at")
        .single();
      if (error) throw new Error(`booking insert failed: ${error.message}`);
      return {
        id: data.id,
        tenantId: data.tenant_id,
        requestId: data.request_id,
        shortToken: data.short_token,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
      };
    },
  };
}

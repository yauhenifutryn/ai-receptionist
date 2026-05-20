/**
 * Storage abstractions consumed by the tool handlers. Injectable so the
 * handlers can be tested without a live Supabase.
 */

import type { AppointmentCategory } from "@ai-receptionist/contracts";

export interface TenantBinding {
  tenantId: string;
  agentRowId: string;
}

export interface InsertBookingArgs {
  tenantId: string;
  agentRowId: string;
  conversationId: string;
  requestId: string;
  slotId: string;
  /** Provider-side external booking id (e.g. "sim_xyz" for simulated). */
  externalId: string;
  /** URL-safe short token for /b/<token> confirmation page. */
  shortToken: string;
  patientName: string;
  patientPhone: string;
  appointmentCategory: AppointmentCategory;
  startsAt: string;
  endsAt: string;
  notes?: string;
}

export interface BookingRow {
  id: string;
  tenantId: string;
  requestId: string;
  shortToken: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Repository contract. Each method must be idempotent on its natural key.
 */
export interface BookingsRepository {
  /** Resolve { tenantId, agentRowId } from the ConvAI-side provider_agent_id. */
  resolveTenantByAgent(providerAgentId: string): Promise<TenantBinding | null>;
  /** Look up existing booking by requestId (idempotency). */
  findBookingByRequestId(requestId: string): Promise<BookingRow | null>;
  /** Insert a new booking row. */
  insertBooking(args: InsertBookingArgs): Promise<BookingRow>;
}

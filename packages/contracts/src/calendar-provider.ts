import type { AppointmentCategory } from "./appointment-category.enum.js";

/**
 * CalendarProvider — abstraction over per-tenant booking systems (PMS / CRM /
 * raw calendar). Vertical-agnostic. Each provider plugs into this interface
 * as its own implementation in `apps/backend/src/integrations/calendar/`:
 *
 *   - SimulatedCalendarProvider — sprint default; synthesizes slots; no I/O
 *   - GoogleCalendarProvider     — post-pilot, when a clinic uses Workspace
 *   - BooksyCalendarProvider     — post-pilot, gated on partner API access
 *   - MedfileCalendarProvider    — post-pilot, REST API for PL medical clinics
 *
 * List + create are required. Cancel is optional — providers that don't
 * implement it surface as "patient must call the clinic to cancel".
 */

export interface AvailabilityWindow {
  from: Date;
  to: Date;
}

export interface AvailableSlot {
  /** Provider-side slot identifier. Opaque to us. */
  slotId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ListAvailableSlotsInput {
  tenantId: string;
  category: AppointmentCategory;
  window?: AvailabilityWindow;
  /** Cap on slots returned. */
  limit: number;
}

export interface CreateBookingInput {
  tenantId: string;
  /** Must originate from a `listAvailableSlots` response in the same conversation. */
  slotId: string;
  patientName: string;
  patientPhone: string;
  category: AppointmentCategory;
  notes?: string;
}

export interface CreateBookingResult {
  /** Provider-side booking identifier. Stored in our `bookings.external_id`. */
  externalId: string;
  /** Sanity-check echo of the persisted slot (post-provider-side validation). */
  startsAt: Date;
  endsAt: Date;
}

export interface CancelBookingInput {
  tenantId: string;
  externalId: string;
}

export interface CalendarProvider {
  listAvailableSlots(input: ListAvailableSlotsInput): Promise<AvailableSlot[]>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  /** Optional. Providers that don't support cancellation omit this. */
  cancelBooking?(input: CancelBookingInput): Promise<void>;
}

import type { AppointmentCategory } from "./appointment-category.enum.js";

/**
 * CalendarProvider — abstraction over per-tenant booking systems (PMS / CRM /
 * raw calendar). Vertical-agnostic. Each vertical's preferred PMS plugs into
 * this interface as its own implementation in `apps/backend/calendar/`:
 *
 *   - vet: VetmanagerProvider (TBD post-vertical-lock)
 *   - HVAC: GoogleCalendarProvider (default fallback)
 *   - dental (deprecated for us): BooksyProvider
 *
 * Two operations are required for the W1 wedge: list available slots and
 * create a booking. Cancel/reschedule are deferred to W2.
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
  /** Sanity-check echo of the persisted slot (post-PMS-side validation). */
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarProvider {
  listAvailableSlots(input: ListAvailableSlotsInput): Promise<AvailableSlot[]>;
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
}

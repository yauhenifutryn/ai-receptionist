import { nanoid } from "nanoid";
import type {
  AppointmentCategory,
  AvailableSlot,
  CalendarProvider,
  CreateBookingInput,
  CreateBookingResult,
  ListAvailableSlotsInput,
} from "@ai-receptionist/contracts";
import { decodeSlot, encodeSlot } from "../../tools/slot-codec.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SLOT_COUNT = 3;

const DURATION_BY_CATEGORY_MIN: Record<AppointmentCategory, number> = {
  consultation: 30,
  routine_service: 30,
  complex_service: 60,
  follow_up: 20,
  emergency_triage: 30,
  information_only: 15,
  other: 30,
};

export interface SimulatedCalendarProviderOptions {
  /** Injected clock for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

export function createSimulatedCalendarProvider(
  opts: SimulatedCalendarProviderOptions = {},
): CalendarProvider {
  const now = opts.now ?? (() => new Date());
  return {
    async listAvailableSlots(input: ListAvailableSlotsInput): Promise<AvailableSlot[]> {
      const durationMin = DURATION_BY_CATEGORY_MIN[input.category];
      const t = now().getTime();
      const baseHourMs = Math.ceil(t / ONE_HOUR_MS) * ONE_HOUR_MS + ONE_HOUR_MS;
      const count = Math.min(input.limit, DEFAULT_SLOT_COUNT);
      const slots: AvailableSlot[] = [];
      for (let i = 0; i < count; i += 1) {
        const start = new Date(baseHourMs + i * 24 * ONE_HOUR_MS);
        const end = new Date(start.getTime() + durationMin * 60 * 1000);
        slots.push({
          slotId: encodeSlot({
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            serviceCategory: input.category,
          }),
          startsAt: start,
          endsAt: end,
        });
      }
      return slots;
    },

    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const slot = decodeSlot(input.slotId);
      if (!slot) {
        throw new Error("slot_not_found");
      }
      return {
        externalId: `sim_${nanoid(12)}`,
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
      };
    },
  };
}

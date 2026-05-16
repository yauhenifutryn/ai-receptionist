import {
  CheckAvailabilityRequestSchema,
  CheckAvailabilityResponseSchema,
  type CheckAvailabilityRequest,
  type CheckAvailabilityResponse,
  type CheckAvailabilitySlot,
  type AppointmentCategory,
} from "@ai-receptionist/contracts";
import { encodeSlot } from "./slot-codec.js";

export interface CheckAvailabilityDeps {
  /** Returns the current time. Injected for deterministic tests. */
  now?: () => Date;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

const DURATION_BY_CATEGORY_MIN: Record<AppointmentCategory, number> = {
  consultation: 30,
  routine_service: 30,
  complex_service: 60,
  follow_up: 20,
  emergency_triage: 30,
  information_only: 15,
  other: 30,
};

function formatLabel(date: Date, language: "pl" | "en" | "ru"): string {
  const fmt: Record<string, Intl.LocalesArgument> = {
    pl: "pl-PL",
    en: "en-GB",
    ru: "ru-RU",
  };
  return new Intl.DateTimeFormat(fmt[language] as Intl.LocalesArgument, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function handleCheckAvailability(
  raw: unknown,
  deps: CheckAvailabilityDeps = {},
): CheckAvailabilityResponse {
  const req: CheckAvailabilityRequest =
    CheckAvailabilityRequestSchema.parse(raw);
  const now = deps.now ? deps.now() : new Date();
  const durationMin = DURATION_BY_CATEGORY_MIN[req.serviceCategory];

  const baseHourMs =
    Math.ceil(now.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS + ONE_HOUR_MS;

  const slots: CheckAvailabilitySlot[] = [0, 24, 48].map((hoursOffset) => {
    const start = new Date(baseHourMs + hoursOffset * ONE_HOUR_MS);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    return {
      slotId: encodeSlot({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        serviceCategory: req.serviceCategory,
      }),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      displayLabel: formatLabel(start, req.language),
    };
  });

  return {
    requestId: req.requestId,
    slots,
    widened: false,
  };
}

export const _internal = { CheckAvailabilityResponseSchema };

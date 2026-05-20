import {
  CheckAvailabilityRequestSchema,
  type CheckAvailabilityRequest,
  type CheckAvailabilityResponse,
  type CheckAvailabilitySlot,
  type CalendarProvider,
} from "@ai-receptionist/contracts";

export interface CheckAvailabilityDeps {
  provider: CalendarProvider;
  tenantId: string;
}

function formatLabel(date: Date, language: "pl" | "en" | "ru"): string {
  const fmt: Record<string, string> = {
    pl: "pl-PL",
    en: "en-GB",
    ru: "ru-RU",
  };
  return new Intl.DateTimeFormat(fmt[language], {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function handleCheckAvailability(
  raw: unknown,
  deps: CheckAvailabilityDeps,
): Promise<CheckAvailabilityResponse> {
  const req: CheckAvailabilityRequest = CheckAvailabilityRequestSchema.parse(raw);
  const providerSlots = await deps.provider.listAvailableSlots({
    tenantId: deps.tenantId,
    category: req.serviceCategory,
    limit: 3,
  });
  const slots: CheckAvailabilitySlot[] = providerSlots.map((s) => ({
    slotId: s.slotId,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    displayLabel: formatLabel(s.startsAt, req.language),
  }));
  return {
    requestId: req.requestId,
    slots,
    widened: false,
  };
}

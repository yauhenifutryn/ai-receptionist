import {
  CreateBookingRequestSchema,
  type CreateBookingRequest,
  type CreateBookingResponse,
  type ServerToolError,
  type CalendarProvider,
} from "@ai-receptionist/contracts";
import type { BookingsRepository } from "./repository.js";
import { generateShortToken } from "../lib/short-token.js";

export interface CreateBookingDeps {
  provider: CalendarProvider;
  repo: BookingsRepository;
  /** Public base URL for the SMS short-URL landing page (no trailing slash). */
  smsShortUrlBase: string;
  /** Optional conversationId pulled from the webhook envelope. Falls back to requestId. */
  conversationId?: string;
}

export type CreateBookingOutcome =
  | { ok: true; response: CreateBookingResponse }
  | { ok: false; error: ServerToolError; status: number };

function buildConfirmation(
  startsAtIso: string,
  language: "pl" | "en" | "ru",
): string {
  const date = new Date(startsAtIso);
  const fmt: Record<string, string> = {
    pl: "pl-PL",
    en: "en-GB",
    ru: "ru-RU",
  };
  const display = new Intl.DateTimeFormat(fmt[language], {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  switch (language) {
    case "pl":
      return `Potwierdzam termin: ${display}.`;
    case "ru":
      return `Подтверждаю время: ${display}.`;
    case "en":
    default:
      return `Booking confirmed: ${display}.`;
  }
}

export async function handleCreateBooking(
  raw: unknown,
  deps: CreateBookingDeps,
): Promise<CreateBookingOutcome> {
  const parsed = CreateBookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "validation_failed",
        callerSafeMessage:
          "Nie udało mi się zarejestrować wizyty. Łączę z kimś z zespołu.",
      },
    };
  }
  const req: CreateBookingRequest = parsed.data;

  const tenant = await deps.repo.resolveTenantByAgent(req.agentId);
  if (!tenant) {
    return {
      ok: false,
      status: 404,
      error: {
        requestId: req.requestId,
        code: "tenant_not_found",
        callerSafeMessage:
          "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
      },
    };
  }

  const existing = await deps.repo.findBookingByRequestId(req.requestId);
  if (existing) {
    return {
      ok: true,
      response: {
        requestId: req.requestId,
        bookingId: existing.id,
        smsShortUrl: `${deps.smsShortUrlBase}/b/${existing.shortToken}`,
        confirmationLine: buildConfirmation(existing.startsAt, req.language),
      },
    };
  }

  // Provider-side reservation. SimulatedCalendarProvider throws "slot_not_found"
  // for undecodable slotIds; real providers will throw similar for taken slots.
  let providerResult;
  try {
    providerResult = await deps.provider.createBooking({
      tenantId: tenant.tenantId,
      slotId: req.slotId,
      patientName: req.patientName,
      patientPhone: req.patientPhone,
      category: req.serviceCategory,
      ...(req.notes !== undefined ? { notes: req.notes } : {}),
    });
  } catch {
    return {
      ok: false,
      status: 409,
      error: {
        requestId: req.requestId,
        code: "slot_no_longer_available",
        callerSafeMessage:
          "Ten termin właśnie się zajął. Mam też kilka innych propozycji.",
      },
    };
  }

  const shortToken = generateShortToken();
  const row = await deps.repo.insertBooking({
    tenantId: tenant.tenantId,
    agentRowId: tenant.agentRowId,
    conversationId: deps.conversationId ?? req.requestId,
    requestId: req.requestId,
    slotId: req.slotId,
    externalId: providerResult.externalId,
    shortToken,
    patientName: req.patientName,
    patientPhone: req.patientPhone,
    appointmentCategory: req.serviceCategory,
    startsAt: providerResult.startsAt.toISOString(),
    endsAt: providerResult.endsAt.toISOString(),
    ...(req.notes !== undefined ? { notes: req.notes } : {}),
  });

  return {
    ok: true,
    response: {
      requestId: req.requestId,
      bookingId: row.id,
      smsShortUrl: `${deps.smsShortUrlBase}/b/${row.shortToken}`,
      confirmationLine: buildConfirmation(row.startsAt, req.language),
    },
  };
}

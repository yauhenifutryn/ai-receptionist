import {
  CreateBookingRequestSchema,
  type CreateBookingRequest,
  type CreateBookingResponse,
  type ServerToolError,
} from "@ai-receptionist/contracts";
import { decodeSlot } from "./slot-codec.js";
import type { BookingsRepository } from "./repository.js";

export interface CreateBookingDeps {
  repo: BookingsRepository;
  /** Public base URL for the SMS short-URL landing page. */
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
  const slot = decodeSlot(req.slotId);
  if (!slot) {
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
  const row =
    existing ??
    (await deps.repo.insertBooking({
      tenantId: tenant.tenantId,
      agentRowId: tenant.agentRowId,
      conversationId: deps.conversationId ?? req.requestId,
      requestId: req.requestId,
      slotId: req.slotId,
      patientName: req.patientName,
      patientPhone: req.patientPhone,
      appointmentCategory: req.serviceCategory,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      ...(req.notes !== undefined ? { notes: req.notes } : {}),
    }));

  return {
    ok: true,
    response: {
      requestId: req.requestId,
      bookingId: row.id,
      smsShortUrl: `${deps.smsShortUrlBase}/b/${row.id}`,
      confirmationLine: buildConfirmation(row.startsAt, req.language),
    },
  };
}

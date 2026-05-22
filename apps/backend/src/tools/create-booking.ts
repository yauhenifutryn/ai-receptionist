import {
  CreateBookingRequestSchema,
  type CreateBookingRequest,
  type CreateBookingResponse,
  type ServerToolError,
  type CalendarProvider,
} from "@ai-receptionist/contracts";
import type { BookingsRepository } from "./repository.js";
import { generateShortToken } from "../lib/short-token.js";
import type { SmsClient } from "../integrations/sms/index.js";
import {
  formatConfirmationSms,
  sendBookingConfirmation,
  type SmsFailureLogger,
} from "./sms-confirmation.js";

export interface CreateBookingDeps {
  provider: CalendarProvider;
  repo: BookingsRepository;
  /** Public base URL for the SMS short-URL landing page (no trailing slash). */
  smsShortUrlBase: string;
  /**
   * SMS dependencies. Both optional — when both present, a Polish SMS
   * confirmation fires post-insert (failure logged, booking still completes).
   * When either is missing, SMS step is skipped silently (useful for tests
   * that don't care about SMS behavior).
   */
  smsClient?: SmsClient;
  smsFailureLogger?: SmsFailureLogger;
  /** Clinic display name for the SMS body. Required when smsClient is set. */
  clinicName?: string;
  /** Clinic's contact phone for cancellation; null in sales-demo phase. */
  contactPhone?: string | null;
  /**
   * Owner-controlled toggle from /owner/settings (item 7). When false, skip
   * the SMS side-effect even if smsClient/logger/clinicName are all present.
   * Defaults to true at the call site if the caller didn't plumb it through
   * — preserves the pre-toggle behavior for any test code that hasn't been
   * updated.
   */
  smsConfirmationsEnabled?: boolean;
  /** Optional conversationId pulled from the webhook envelope. Falls back to requestId. */
  conversationId?: string;
}

export type CreateBookingOutcome =
  | { ok: true; response: CreateBookingResponse }
  | { ok: false; error: ServerToolError; status: number };

function buildConfirmation(startsAtIso: string, language: "pl" | "en" | "ru"): string {
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
        callerSafeMessage: "Nie udało mi się zarejestrować wizyty. Łączę z kimś z zespołu.",
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
        callerSafeMessage: "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
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
      // patientPhone is optional now: agent must NOT ask the caller for it.
      // When absent, downstream SMS confirmation is skipped (see below).
      // The string fallback "" keeps the legacy CalendarProvider signature
      // unchanged while signalling "no phone" cleanly to the provider impl.
      patientPhone: req.patientPhone ?? "",
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
        callerSafeMessage: "Ten termin właśnie się zajął. Mam też kilka innych propozycji.",
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
    patientPhone: req.patientPhone ?? "",
    appointmentCategory: req.serviceCategory,
    startsAt: providerResult.startsAt.toISOString(),
    endsAt: providerResult.endsAt.toISOString(),
    ...(req.notes !== undefined ? { notes: req.notes } : {}),
  });

  // Side-effect: SMS confirmation. Non-blocking — failure logged, booking
  // still committed (we already inserted above). Skipped when SMS deps absent
  // OR when the owner has toggled SMS off via /owner/settings (item 7).
  const smsToggleOn = deps.smsConfirmationsEnabled !== false;
  if (!smsToggleOn) {
    // Structured info log only — no PII. Tenant id is opaque; no patient data.
    console.log(
      JSON.stringify({
        level: "info",
        event: "sms_skipped_tenant_toggle_off",
        tenantId: tenant.tenantId,
        bookingId: row.id,
      }),
    );
  }
  // SMS only when we actually have a phone number. The agent is instructed
  // to NEVER ask the caller for one; the number comes from SIP caller_id at
  // call time. Browser / PIN demo calls have no caller_id, so we skip SMS
  // and the booking is still committed (visible in the operator panel).
  const hasPhone = !!req.patientPhone && req.patientPhone.trim().length > 0;
  if (!hasPhone) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "sms_skipped_no_phone",
        tenantId: tenant.tenantId,
        bookingId: row.id,
      }),
    );
  }
  if (
    hasPhone &&
    smsToggleOn &&
    deps.smsClient &&
    deps.smsFailureLogger &&
    deps.clinicName
  ) {
    const smsBody = formatConfirmationSms({
      clinicName: deps.clinicName,
      startsAt: providerResult.startsAt,
      shortUrl: `${deps.smsShortUrlBase}/b/${row.shortToken}`,
      contactPhone: deps.contactPhone ?? null,
      language: req.language,
    });
    await sendBookingConfirmation({
      client: deps.smsClient,
      logger: deps.smsFailureLogger,
      to: req.patientPhone!,
      body: smsBody,
      tenantId: tenant.tenantId,
      bookingId: row.id,
    });
  }

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

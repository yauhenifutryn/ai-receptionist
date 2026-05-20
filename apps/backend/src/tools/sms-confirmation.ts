import type { SmsClient } from "../integrations/sms/index.js";
import { SmsSendError } from "../integrations/sms/index.js";

export interface FormatConfirmationInput {
  clinicName: string;
  startsAt: Date;
  shortUrl: string;
  /** Clinic's contact phone, or null in sales-demo phase. */
  contactPhone: string | null;
  language: "pl" | "en" | "ru";
}

// ASCII-only output — Polish characters via SMS depend on the gateway's UTF-8
// handling. ASCII guarantees one segment (160 chars) on every carrier and
// avoids "?" garble fallbacks. Day names from Intl are already locale-correct
// in their accented form; we strip accents post-format.
const ASCII_REPLACEMENTS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
  Ą: "A",
  Ć: "C",
  Ę: "E",
  Ł: "L",
  Ń: "N",
  Ó: "O",
  Ś: "S",
  Ź: "Z",
  Ż: "Z",
};

function asciize(s: string): string {
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => ASCII_REPLACEMENTS[c] ?? c);
}

export function formatConfirmationSms(input: FormatConfirmationInput): string {
  const locale = { pl: "pl-PL", en: "en-GB", ru: "ru-RU" }[input.language];
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(input.startsAt);
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  }).format(input.startsAt);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(input.startsAt);
  const lines = [
    `Potwierdzenie wizyty w ${input.clinicName}:`,
    `${dayName} ${dayMonth} o ${time}.`,
    `Szczegoly: ${input.shortUrl}`,
  ];
  if (input.contactPhone) {
    lines.push(`Aby odwolac, zadzwon: ${input.contactPhone}`);
  }
  return asciize(lines.join("\n"));
}

export interface SmsFailureLogInput {
  tenantId: string;
  bookingId: string;
  toPhone: string;
  errorCode: string;
  errorMessage: string;
}

export interface SmsFailureLogger {
  logFailure(input: SmsFailureLogInput): Promise<void>;
}

export interface SendBookingConfirmationInput {
  client: SmsClient;
  logger: SmsFailureLogger;
  to: string;
  body: string;
  tenantId: string;
  bookingId: string;
}

export type SendBookingConfirmationResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string };

export async function sendBookingConfirmation(
  input: SendBookingConfirmationInput,
): Promise<SendBookingConfirmationResult> {
  try {
    const r = await input.client.send({ to: input.to, body: input.body });
    return { ok: true, messageId: r.messageId };
  } catch (e) {
    const code = e instanceof SmsSendError ? e.code : "internal_error";
    const message = e instanceof SmsSendError ? e.providerMessage : (e as Error).message;
    await input.logger.logFailure({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      toPhone: input.to,
      errorCode: code,
      errorMessage: message,
    });
    return { ok: false, code };
  }
}

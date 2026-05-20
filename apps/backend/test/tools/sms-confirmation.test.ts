import { describe, it, expect, vi } from "vitest";
import {
  formatConfirmationSms,
  sendBookingConfirmation,
  type SmsFailureLogger,
} from "../../src/tools/sms-confirmation.js";
import type { SmsClient } from "../../src/integrations/sms/index.js";
import { SmsSendError } from "../../src/integrations/sms/index.js";

describe("formatConfirmationSms", () => {
  it("sales-demo phase: no clinic phone → omits cancellation line", () => {
    const body = formatConfirmationSms({
      clinicName: "ABC Stomatologia",
      startsAt: new Date("2026-05-23T08:00:00.000Z"),
      shortUrl: "https://abcclinic.app/b/AbCdEfGh",
      contactPhone: null,
      language: "pl",
    });
    expect(body).toContain("Potwierdzenie wizyty w ABC Stomatologia");
    expect(body).toContain("https://abcclinic.app/b/AbCdEfGh");
    expect(body).not.toContain("Aby odwolac");
    expect(body).not.toContain("Aby odwołać");
  });

  it("production-pilot phase: clinic phone present → includes cancellation line", () => {
    const body = formatConfirmationSms({
      clinicName: "ABC Stomatologia",
      startsAt: new Date("2026-05-23T08:00:00.000Z"),
      shortUrl: "https://abcclinic.app/b/AbCdEfGh",
      contactPhone: "+48221234567",
      language: "pl",
    });
    expect(body).toContain("Aby odwolac, zadzwon: +48221234567");
  });

  it("uses Polish locale day name", () => {
    const body = formatConfirmationSms({
      clinicName: "X",
      startsAt: new Date("2026-05-23T08:00:00.000Z"),
      shortUrl: "u",
      contactPhone: null,
      language: "pl",
    });
    expect(body).toMatch(/sobota|niedziela|poniedzialek|wtorek|sroda|czwartek|piatek/i);
  });

  it("ASCII-only output (no Polish accents)", () => {
    const body = formatConfirmationSms({
      clinicName: "Stomatologia Zażółć",
      startsAt: new Date("2026-05-23T08:00:00.000Z"),
      shortUrl: "u",
      contactPhone: null,
      language: "pl",
    });
    expect(body).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
    expect(body).toContain("Zazolc");
  });
});

describe("sendBookingConfirmation", () => {
  it("calls SmsClient.send and returns ok with messageId", async () => {
    const client: SmsClient = { send: vi.fn(async () => ({ messageId: "m1" })) };
    const logger: SmsFailureLogger = { logFailure: vi.fn() };
    const result = await sendBookingConfirmation({
      client,
      logger,
      to: "+48501234567",
      body: "Test",
      tenantId: "t1",
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: true, messageId: "m1" });
    expect(client.send).toHaveBeenCalledWith({ to: "+48501234567", body: "Test" });
    expect(logger.logFailure).not.toHaveBeenCalled();
  });

  it("on SmsSendError: logs and returns ok:false (does NOT throw)", async () => {
    const client: SmsClient = {
      send: vi.fn(async () => {
        throw new SmsSendError("zadarma_error", "low_balance");
      }),
    };
    const logger: SmsFailureLogger = { logFailure: vi.fn(async () => {}) };
    const result = await sendBookingConfirmation({
      client,
      logger,
      to: "+48501234567",
      body: "Test",
      tenantId: "t1",
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: false, code: "zadarma_error" });
    expect(logger.logFailure).toHaveBeenCalledWith({
      tenantId: "t1",
      bookingId: "b1",
      toPhone: "+48501234567",
      errorCode: "zadarma_error",
      errorMessage: "low_balance",
    });
  });

  it("on unexpected throw: logs as internal_error and returns ok:false", async () => {
    const client: SmsClient = {
      send: vi.fn(async () => {
        throw new Error("kaboom");
      }),
    };
    const logger: SmsFailureLogger = { logFailure: vi.fn(async () => {}) };
    const result = await sendBookingConfirmation({
      client,
      logger,
      to: "+48501234567",
      body: "Test",
      tenantId: "t1",
      bookingId: "b1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("internal_error");
  });
});

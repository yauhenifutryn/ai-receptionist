import { describe, it, expect, vi } from "vitest";
import { handleCreateBooking } from "../../src/tools/create-booking.js";
import { encodeSlot } from "../../src/tools/slot-codec.js";
import type {
  BookingsRepository,
  InsertBookingArgs,
  BookingRow,
} from "../../src/tools/repository.js";
import { createSimulatedCalendarProvider } from "../../src/integrations/calendar/simulated-calendar-provider.js";
import type { SmsClient } from "../../src/integrations/sms/index.js";
import type { SmsFailureLogger } from "../../src/tools/sms-confirmation.js";

const provider = createSimulatedCalendarProvider({
  now: () => new Date("2026-05-16T13:23:45.000Z"),
});

function buildRepo(overrides: Partial<BookingsRepository> = {}): BookingsRepository {
  return {
    async resolveTenantByAgent(agentId: string) {
      if (agentId === "agent-77") {
        return { tenantId: "tenant-1", agentRowId: "agent-row-1" };
      }
      return null;
    },
    async findBookingByRequestId() {
      return null;
    },
    async insertBooking(args: InsertBookingArgs): Promise<BookingRow> {
      return {
        id: "booking-1",
        tenantId: args.tenantId,
        requestId: args.requestId,
        shortToken: args.shortToken,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      };
    },
    ...overrides,
  };
}

const slotId = encodeSlot({
  startsAt: "2026-05-17T09:00:00.000Z",
  endsAt: "2026-05-17T09:30:00.000Z",
  serviceCategory: "consultation",
});

const REQ_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const baseRequest = {
  requestId: REQ_ID,
  agentId: "agent-77",
  slotId,
  patientName: "Jan Kowalski",
  patientPhone: "+48 600 123 456",
  serviceCategory: "consultation" as const,
  language: "pl" as const,
};

describe("handleCreateBooking (W2.3, CalendarProvider DI)", () => {
  it("happy path writes a booking with external_id + short_token, returns smsShortUrl", async () => {
    const insertSpy = vi
      .fn()
      .mockImplementation(async (args: InsertBookingArgs): Promise<BookingRow> => ({
        id: "booking-9",
        tenantId: args.tenantId,
        requestId: args.requestId,
        shortToken: args.shortToken,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      }));
    const repo = buildRepo({ insertBooking: insertSpy });
    const out = await handleCreateBooking(baseRequest, {
      provider,
      repo,
      smsShortUrlBase: "https://app.example.com",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.response.bookingId).toBe("booking-9");
    expect(out.response.smsShortUrl).toMatch(
      /^https:\/\/app\.example\.com\/b\/[A-Za-z0-9]{8}$/,
    );
    expect(out.response.confirmationLine).toMatch(/Potwierdzam/);
    expect(insertSpy).toHaveBeenCalledOnce();
    const insertedArgs = insertSpy.mock.calls[0]![0] as InsertBookingArgs;
    expect(insertedArgs.tenantId).toBe("tenant-1");
    expect(insertedArgs.patientPhone).toBe("+48 600 123 456");
    expect(insertedArgs.appointmentCategory).toBe("consultation");
    expect(insertedArgs.startsAt).toBe("2026-05-17T09:00:00.000Z");
    expect(insertedArgs.endsAt).toBe("2026-05-17T09:30:00.000Z");
    expect(insertedArgs.externalId).toMatch(/^sim_/);
    expect(insertedArgs.shortToken).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("idempotent: existing booking with same requestId is returned, no insert", async () => {
    const insertSpy = vi.fn();
    const repo = buildRepo({
      async findBookingByRequestId() {
        return {
          id: "existing-1",
          tenantId: "tenant-1",
          requestId: REQ_ID,
          shortToken: "AbCdEfGh",
          startsAt: "2026-05-17T09:00:00.000Z",
          endsAt: "2026-05-17T09:30:00.000Z",
        };
      },
      insertBooking: insertSpy,
    });
    const out = await handleCreateBooking(baseRequest, {
      provider,
      repo,
      smsShortUrlBase: "https://app.example.com",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.response.bookingId).toBe("existing-1");
    expect(out.response.smsShortUrl).toBe("https://app.example.com/b/AbCdEfGh");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns validation_failed (400) on schema-invalid body", async () => {
    const out = await handleCreateBooking(
      { bogus: true },
      { provider, repo: buildRepo(), smsShortUrlBase: "https://app.example.com" },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error.code).toBe("validation_failed");
  });

  it("returns slot_no_longer_available (409) on undecodable slotId", async () => {
    const out = await handleCreateBooking(
      { ...baseRequest, slotId: "garbage" },
      { provider, repo: buildRepo(), smsShortUrlBase: "https://app.example.com" },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.error.code).toBe("slot_no_longer_available");
  });

  it("returns tenant_not_found (404) when agentId is unknown", async () => {
    const out = await handleCreateBooking(
      { ...baseRequest, agentId: "agent-unknown" },
      { provider, repo: buildRepo(), smsShortUrlBase: "https://app.example.com" },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(404);
    expect(out.error.code).toBe("tenant_not_found");
  });

  it("fires SMS confirmation when smsClient + logger + clinicName provided (happy path)", async () => {
    const sent: Array<{ to: string; body: string }> = [];
    const smsClient: SmsClient = {
      send: async ({ to, body }) => {
        sent.push({ to, body });
        return { messageId: "msg_1" };
      },
    };
    const logFailure = vi.fn(async () => {});
    const smsFailureLogger: SmsFailureLogger = { logFailure };
    const out = await handleCreateBooking(baseRequest, {
      provider,
      repo: buildRepo(),
      smsShortUrlBase: "https://abcclinic.app",
      smsClient,
      smsFailureLogger,
      clinicName: "ABC Stomatologia",
      contactPhone: null,
    });
    expect(out.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("+48 600 123 456");
    expect(sent[0]!.body).toContain("ABC Stomatologia");
    expect(sent[0]!.body).toContain("https://abcclinic.app/b/");
    expect(logFailure).not.toHaveBeenCalled();
  });

  it("SMS failure does NOT fail the booking; logs to SmsFailureLogger", async () => {
    const smsClient: SmsClient = {
      send: async () => {
        throw new Error("boom");
      },
    };
    const logFailure = vi.fn(async () => {});
    const smsFailureLogger: SmsFailureLogger = { logFailure };
    const out = await handleCreateBooking(baseRequest, {
      provider,
      repo: buildRepo(),
      smsShortUrlBase: "https://abcclinic.app",
      smsClient,
      smsFailureLogger,
      clinicName: "ABC",
      contactPhone: null,
    });
    expect(out.ok).toBe(true);
    expect(logFailure).toHaveBeenCalledOnce();
    expect(logFailure.mock.calls[0]![0]!.errorCode).toBe("internal_error");
  });

  it("conversationId from the envelope is preferred over the requestId fallback", async () => {
    const insertSpy = vi
      .fn()
      .mockImplementation(async (args: InsertBookingArgs): Promise<BookingRow> => ({
        id: "booking-11",
        tenantId: args.tenantId,
        requestId: args.requestId,
        shortToken: args.shortToken,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      }));
    const repo = buildRepo({ insertBooking: insertSpy });
    await handleCreateBooking(baseRequest, {
      provider,
      repo,
      smsShortUrlBase: "https://app.example.com",
      conversationId: "conv-xyz",
    });
    expect((insertSpy.mock.calls[0]![0] as InsertBookingArgs).conversationId).toBe(
      "conv-xyz",
    );
  });
});

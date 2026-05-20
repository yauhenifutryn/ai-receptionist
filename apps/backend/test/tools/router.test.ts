import { describe, it, expect, vi } from "vitest";
import { createToolsRouter } from "../../src/tools/router.js";
import { encodeSlot } from "../../src/tools/slot-codec.js";
import { createSimulatedCalendarProvider } from "../../src/integrations/calendar/simulated-calendar-provider.js";
import type {
  BookingsRepository,
  InsertBookingArgs,
  BookingRow,
} from "../../src/tools/repository.js";
import type { SmsClient } from "../../src/integrations/sms/index.js";
import type { SmsFailureLogger } from "../../src/tools/sms-confirmation.js";

const FROZEN_NOW = new Date("2026-05-16T13:00:00.000Z");

function buildRouter() {
  const provider = createSimulatedCalendarProvider({ now: () => FROZEN_NOW });
  const inserts: InsertBookingArgs[] = [];
  const repo: BookingsRepository = {
    resolveTenantByAgent: vi.fn(async () => ({
      tenantId: "tenant-1",
      agentRowId: "agent-row-1",
    })),
    findBookingByRequestId: vi.fn(async () => null),
    insertBooking: vi.fn(async (args): Promise<BookingRow> => {
      inserts.push(args);
      return {
        id: "booking-1",
        tenantId: args.tenantId,
        requestId: args.requestId,
        shortToken: args.shortToken,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      };
    }),
  };
  const sent: Array<{ to: string; body: string }> = [];
  const smsClient: SmsClient = {
    send: async ({ to, body }) => {
      sent.push({ to, body });
      return { messageId: "msg_test" };
    },
  };
  const smsFailureLogger: SmsFailureLogger = { logFailure: vi.fn(async () => {}) };

  const app = createToolsRouter({
    repo,
    provider,
    smsShortUrlBase: "https://app.example.com",
    smsClient,
    smsFailureLogger,
    resolveTenantConfig: async (agentId) => {
      if (agentId !== "agent-77") return null;
      return {
        tenantId: "tenant-1",
        clinicName: "ABC Stomatologia",
        contactPhone: null,
        smsConfirmationsEnabled: true,
      };
    },
  });

  return { app, inserts, sent };
}

describe("tools HTTP router (W2.3, CalendarProvider DI)", () => {
  it("POST /tools/check-availability returns 200 + 3 slots", async () => {
    const { app } = buildRouter();
    const res = await app.request("/tools/check-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "11111111-1111-1111-1111-111111111111",
        agentId: "agent-77",
        serviceCategory: "consultation",
        language: "pl",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { slots: unknown[] };
    expect(json.slots).toHaveLength(3);
  });

  it("POST /tools/check-availability returns 400 on schema-invalid body", async () => {
    const { app } = buildRouter();
    // Send a body that PASSES the tenant lookup (has valid agentId) but
    // FAILS schema validation (bad serviceCategory). Router resolves tenant
    // first, then schema validation inside handleCheckAvailability throws,
    // caught and surfaced as 400.
    const res = await app.request("/tools/check-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "11111111-1111-1111-1111-111111111111",
        agentId: "agent-77",
        serviceCategory: "not_a_category",
        language: "pl",
      }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("validation_failed");
  });

  it("POST /tools/check-availability returns 404 when agent has no tenant config", async () => {
    const { app } = buildRouter();
    const res = await app.request("/tools/check-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "11111111-1111-1111-1111-111111111111",
        agentId: "agent-unknown",
        serviceCategory: "consultation",
        language: "pl",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /tools/create-booking returns 200 + fires SMS with clinic name", async () => {
    const { app, inserts, sent } = buildRouter();
    const slotId = encodeSlot({
      startsAt: "2026-05-17T09:00:00.000Z",
      endsAt: "2026-05-17T09:30:00.000Z",
      serviceCategory: "consultation",
    });
    const res = await app.request("/tools/create-booking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        agentId: "agent-77",
        slotId,
        patientName: "Jan Kowalski",
        patientPhone: "+48 600 123 456",
        serviceCategory: "consultation",
        language: "pl",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { bookingId: string; smsShortUrl: string };
    expect(json.bookingId).toBe("booking-1");
    expect(json.smsShortUrl).toMatch(/^https:\/\/app\.example\.com\/b\/[A-Za-z0-9]{8}$/);
    expect(inserts).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain("ABC Stomatologia");
  });
});

import { describe, it, expect } from "vitest";
import { createToolsRouter } from "../../src/tools/router.js";
import { encodeSlot } from "../../src/tools/slot-codec.js";
import type { BookingsRepository, InsertBookingArgs, BookingRow } from "../../src/tools/repository.js";

const repo: BookingsRepository = {
  async resolveTenantByAgent(agentId) {
    return agentId === "agent-77"
      ? { tenantId: "tenant-1", agentRowId: "agent-row-1" }
      : null;
  },
  async findBookingByRequestId() {
    return null;
  },
  async insertBooking(args: InsertBookingArgs): Promise<BookingRow> {
    return {
      id: "booking-1",
      tenantId: args.tenantId,
      requestId: args.requestId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    };
  },
};

const FROZEN_NOW = new Date("2026-05-16T13:00:00.000Z");

describe("tools HTTP router (W2.3)", () => {
  const app = createToolsRouter({
    repo,
    smsShortUrlBase: "https://app.example.com",
    now: () => FROZEN_NOW,
  });

  it("POST /tools/check-availability returns 200 + 3 slots", async () => {
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

  it("POST /tools/check-availability returns 400 on bad body", async () => {
    const res = await app.request("/tools/check-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("validation_failed");
  });

  it("POST /tools/create-booking returns 200 on valid input", async () => {
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
    expect(json.smsShortUrl).toBe("https://app.example.com/b/booking-1");
  });
});

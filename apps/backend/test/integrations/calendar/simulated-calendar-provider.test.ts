import { describe, it, expect } from "vitest";
import { createSimulatedCalendarProvider } from "../../../src/integrations/calendar/simulated-calendar-provider.js";
import { decodeSlot } from "../../../src/tools/slot-codec.js";

describe("SimulatedCalendarProvider", () => {
  const fixedNow = new Date("2026-05-21T10:30:00.000Z");
  const provider = createSimulatedCalendarProvider({ now: () => fixedNow });

  it("returns 3 slots for a category, starting at the next whole hour", async () => {
    const slots = await provider.listAvailableSlots({
      tenantId: "t1",
      category: "consultation",
      limit: 5,
    });
    expect(slots).toHaveLength(3);
    // Next whole hour after 10:30 UTC is 11:00 UTC + 1h = 12:00 UTC.
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-05-21T12:00:00.000Z");
    expect(slots[1]!.startsAt.toISOString()).toBe("2026-05-22T12:00:00.000Z");
    expect(slots[2]!.startsAt.toISOString()).toBe("2026-05-23T12:00:00.000Z");
  });

  it("honors limit when smaller than default 3", async () => {
    const slots = await provider.listAvailableSlots({
      tenantId: "t1",
      category: "consultation",
      limit: 2,
    });
    expect(slots).toHaveLength(2);
  });

  it("encodes slotIds that round-trip via slot-codec", async () => {
    const slots = await provider.listAvailableSlots({
      tenantId: "t1",
      category: "consultation",
      limit: 1,
    });
    const decoded = decodeSlot(slots[0]!.slotId);
    expect(decoded?.startsAt).toBe(slots[0]!.startsAt.toISOString());
    expect(decoded?.endsAt).toBe(slots[0]!.endsAt.toISOString());
    expect(decoded?.serviceCategory).toBe("consultation");
  });

  it("createBooking returns sim_ externalId and echoes slot timing", async () => {
    const slots = await provider.listAvailableSlots({
      tenantId: "t1",
      category: "routine_service",
      limit: 1,
    });
    const result = await provider.createBooking({
      tenantId: "t1",
      slotId: slots[0]!.slotId,
      patientName: "Jan Kowalski",
      patientPhone: "+48501234567",
      category: "routine_service",
    });
    expect(result.externalId).toMatch(/^sim_[A-Za-z0-9_-]{12,}$/);
    expect(result.startsAt.toISOString()).toBe(slots[0]!.startsAt.toISOString());
    expect(result.endsAt.toISOString()).toBe(slots[0]!.endsAt.toISOString());
  });

  it("createBooking throws slot_not_found on undecodable slotId", async () => {
    await expect(
      provider.createBooking({
        tenantId: "t1",
        slotId: "garbage",
        patientName: "Jan",
        patientPhone: "+48500000000",
        category: "consultation",
      }),
    ).rejects.toThrow(/slot_not_found/);
  });
});

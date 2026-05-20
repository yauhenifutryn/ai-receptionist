import { describe, it, expect } from "vitest";
import { handleCheckAvailability } from "../../src/tools/check-availability.js";
import { decodeSlot } from "../../src/tools/slot-codec.js";
import { CheckAvailabilityResponseSchema } from "@ai-receptionist/contracts";
import { createSimulatedCalendarProvider } from "../../src/integrations/calendar/simulated-calendar-provider.js";

const FROZEN_NOW = new Date("2026-05-16T13:23:45.000Z");
const provider = createSimulatedCalendarProvider({ now: () => FROZEN_NOW });
const deps = { provider, tenantId: "t-test" };

describe("handleCheckAvailability (W2.3, CalendarProvider DI)", () => {
  it("returns exactly 3 slots with future start times, Zod-valid", async () => {
    const out = await handleCheckAvailability(
      {
        requestId: "11111111-1111-1111-1111-111111111111",
        agentId: "agent-77",
        serviceCategory: "consultation",
        language: "pl",
      },
      deps,
    );
    expect(out.slots).toHaveLength(3);
    for (const s of out.slots) {
      expect(new Date(s.startsAt).getTime()).toBeGreaterThan(FROZEN_NOW.getTime());
      expect(new Date(s.endsAt).getTime()).toBeGreaterThan(new Date(s.startsAt).getTime());
    }
    expect(CheckAvailabilityResponseSchema.safeParse(out).success).toBe(true);
  });

  it("slotIds round-trip through the codec", async () => {
    const out = await handleCheckAvailability(
      {
        requestId: "22222222-2222-2222-2222-222222222222",
        agentId: "agent-77",
        serviceCategory: "complex_service",
        language: "pl",
      },
      deps,
    );
    for (const s of out.slots) {
      const decoded = decodeSlot(s.slotId);
      expect(decoded).not.toBeNull();
      expect(decoded?.startsAt).toBe(s.startsAt);
      expect(decoded?.endsAt).toBe(s.endsAt);
      expect(decoded?.serviceCategory).toBe("complex_service");
    }
  });

  it("displayLabel is localized by language", async () => {
    const polish = await handleCheckAvailability(
      {
        requestId: "33333333-3333-3333-3333-333333333333",
        agentId: "agent-77",
        serviceCategory: "consultation",
        language: "pl",
      },
      deps,
    );
    const english = await handleCheckAvailability(
      {
        requestId: "44444444-4444-4444-4444-444444444444",
        agentId: "agent-77",
        serviceCategory: "consultation",
        language: "en",
      },
      deps,
    );
    expect(polish.slots[0]!.displayLabel).not.toBe(english.slots[0]!.displayLabel);
  });

  it("throws when request body is invalid", async () => {
    await expect(handleCheckAvailability({ wrong: "shape" }, deps)).rejects.toThrow();
  });

  it("duration is category-dependent (complex_service longer than information_only)", async () => {
    const complex = await handleCheckAvailability(
      {
        requestId: "55555555-5555-5555-5555-555555555555",
        agentId: "agent-77",
        serviceCategory: "complex_service",
        language: "pl",
      },
      deps,
    );
    const info = await handleCheckAvailability(
      {
        requestId: "66666666-6666-6666-6666-666666666666",
        agentId: "agent-77",
        serviceCategory: "information_only",
        language: "pl",
      },
      deps,
    );
    const complexDur =
      new Date(complex.slots[0]!.endsAt).getTime() - new Date(complex.slots[0]!.startsAt).getTime();
    const infoDur =
      new Date(info.slots[0]!.endsAt).getTime() - new Date(info.slots[0]!.startsAt).getTime();
    expect(complexDur).toBeGreaterThan(infoDur);
  });
});

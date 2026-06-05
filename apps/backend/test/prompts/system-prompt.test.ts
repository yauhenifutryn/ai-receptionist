import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/prompts/system-prompt.js";

// Invariant: a demo agent asked for an appointment explains it is a demo with
// no calendar connection and never attempts a booking tool call (a failed tool
// call killed a live demo call — agent said "yes I can book", then the
// conversation died on a 404 webhook).
describe("buildSystemPrompt booking modes", () => {
  it("demo mode (default): no booking tools, explicit demo disclaimer", () => {
    const prompt = buildSystemPrompt({ tenantDisplayName: "Testowa Klinika" });

    // No tool-calling instructions may survive in demo mode.
    expect(prompt).not.toContain("check_availability");
    expect(prompt).not.toContain("create_booking");

    // The trilingual demo disclaimer must be present (PL canonical + EN + RU).
    expect(prompt).toContain("wersja demonstracyjna");
    expect(prompt).toContain("demo version");
    expect(prompt).toContain("демо-версия");

    // The agent must be told to never fake a booking confirmation.
    expect(prompt).toMatch(/NEVER (claim|say|pretend).*book/i);
  });

  it("bookingEnabled: true keeps the full booking flow", () => {
    const prompt = buildSystemPrompt({
      tenantDisplayName: "Testowa Klinika",
      bookingEnabled: true,
    });

    expect(prompt).toContain("check_availability");
    expect(prompt).toContain("create_booking");
    expect(prompt).not.toContain("wersja demonstracyjna");
  });
});

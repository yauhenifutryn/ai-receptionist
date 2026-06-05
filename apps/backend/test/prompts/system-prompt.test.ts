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

  // Invariant (2026-06-05 semantic bench): the demo prompt must not script
  // fake capabilities. Live transcripts showed agents promising transfers
  // ("Łączę z koordynatorem") and callbacks ("oddzwonimy") BECAUSE the prompt
  // told them to — neither is possible in a demo deployment.
  it("demo mode: no scripted fake transfer or callback promises", () => {
    const prompt = buildSystemPrompt({ tenantDisplayName: "Testowa Klinika" });

    expect(prompt).not.toContain("Łączę z koordynatorem");
    // The old prescriptive templates ("sprawdzę z X i oddzwonimy", "oddzwonimy
    // w ciągu godziny", "offer to call back") must be gone. The word may still
    // appear once, inside the explicit prohibition list of banned phrases.
    expect(prompt).not.toContain("i oddzwonimy");
    expect(prompt).not.toContain("offer to call back");
    expect(prompt).toContain("CANNOT transfer");
    expect(prompt).toContain("cannot call anyone back");
  });

  // Invariant (2026-06-05): name capture is answer-first and never repeated
  // after the caller introduces themselves (the live "jestem Nikita" bug).
  it("name capture: answer first, never re-ask after an introduction", () => {
    const prompt = buildSystemPrompt({ tenantDisplayName: "Testowa Klinika" });

    expect(prompt).toContain("ANSWER THE CALLER'S QUESTION FIRST");
    expect(prompt).toContain("NEVER ask for their name");
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

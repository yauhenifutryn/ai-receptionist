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

  // Invariant (2026-06-06): core clinic facts are baked into the prompt so
  // RAG retrieval variance can never lose hours/address/phone (a live call
  // had the agent deny knowing the opening hours, then find them on re-ask).
  it("clinicFacts: renders the always-true block; absent when omitted", () => {
    const facts = {
      address: "Kraków, ul. Romanowicza 1",
      phone: "+48576676266",
      hoursLines: ["Poniedziałek: 08:00-20:00", "Sobota: 08:00-14:00"],
    };
    const withFacts = buildSystemPrompt({ tenantDisplayName: "Testowa", clinicFacts: facts });
    expect(withFacts).toContain("CORE CLINIC FACTS");
    expect(withFacts).toContain("Poniedziałek: 08:00-20:00");
    expect(withFacts).toContain("+48576676266");

    const without = buildSystemPrompt({ tenantDisplayName: "Testowa" });
    expect(without).not.toContain("CORE CLINIC FACTS");
  });

  it("clinicFacts: 'brak danych' days come with the honesty convention (REGRESSION annadentalclinic.com sim: agent asserted 'w soboty całkowicie zamknięta' for an unpublished day)", () => {
    // The site publishes Mon-Fri hours only; the KB marks saturday/sunday
    // as "brak danych". Without an explicit convention the agent read
    // that as "closed" and CLAIMED full Saturday closure — fabrication of
    // a fact the clinic never published.
    const facts = {
      hoursLines: ["Poniedziałek: 08:00-20:00", "Sobota: brak danych", "Niedziela: zamknięte"],
    };
    const withFacts = buildSystemPrompt({ tenantDisplayName: "Testowa", clinicFacts: facts });
    expect(withFacts).toMatch(
      /brak danych.*(nie ma|nie podaje|nie publikuje)|"brak danych" means/i,
    );
    expect(withFacts).toMatch(/zamknięte/);

    // No convention noise when every day has real hours.
    const clean = buildSystemPrompt({
      tenantDisplayName: "Testowa",
      clinicFacts: { hoursLines: ["Poniedziałek: 08:00-20:00"] },
    });
    expect(clean).not.toMatch(/"brak danych" means/i);
  });

  it("clinicFactsFromKnowledgeMarkdown parses the generated knowledge.md shape", async () => {
    const { clinicFactsFromKnowledgeMarkdown } = await import("../../src/prompts/system-prompt.js");
    const md = [
      "# Klinika X",
      "## Klinika",
      "Opis.",
      "",
      "- Adres: Kraków, ul. Testowa 5, 30-001",
      "- Telefon: +48123456789",
      "",
      "## Godziny otwarcia (znane także jako: godziny pracy)",
      "",
      "- Poniedziałek: 08:00-20:00",
      "- Sobota: 08:00-14:00",
      "- Niedziela: zamknięte",
    ].join("\n");
    expect(clinicFactsFromKnowledgeMarkdown(md)).toEqual({
      address: "Kraków, ul. Testowa 5, 30-001",
      phone: "+48123456789",
      hoursLines: ["Poniedziałek: 08:00-20:00", "Sobota: 08:00-14:00", "Niedziela: zamknięte"],
    });
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

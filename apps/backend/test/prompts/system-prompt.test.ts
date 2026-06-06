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

  it("clinicFacts: 'brak danych' days carry a line-local Polish hard rule (REGRESSION annadentalclinic.com REAL CALL 2026-06-06: 'W soboty nasza klinika nie pracuje')", () => {
    // The previous English footnote survived a sim but FAILED the real call
    // (conv_5201ktew…): gemini-3.1-flash-lite resolved the contradiction
    // between the CORE FACTS header ("Never say you don't know these") and
    // the footnote by asserting closure. The rule must be (a) Polish,
    // (b) line-local on each affected day, (c) spell out the banned
    // phrasings verbatim — including the live failure "nie pracuje" —
    // (d) give the exact required response, and (e) carve the exception
    // out of the header instruction itself.
    const facts = {
      phone: "+48583000194",
      hoursLines: ["Poniedziałek: 08:00-20:00", "Sobota: brak danych", "Niedziela: zamknięte"],
    };
    const p = buildSystemPrompt({ tenantDisplayName: "Testowa", clinicFacts: facts });

    // (e) header carve-out so "never say you don't know" can't override
    expect(p).toMatch(/EXCEPTION: days marked "brak danych"/);
    // (b) line-local marker on the affected day only
    expect(p).toContain("Sobota: brak danych — obowiązuje ZASADA");
    expect(p).toContain("Niedziela: zamknięte");
    expect(p).not.toContain("Niedziela: zamknięte — obowiązuje");
    // (a, c) Polish hard rule with banned phrasings, incl. the live failure
    expect(p).toMatch(/ZASADA "brak danych"/);
    expect(p).toMatch(/NIGDY/);
    expect(p).toContain('"nie pracuje"');
    expect(p).toMatch(/zamknięta|nieczynna/);
    // (d) canned response + reception phone offer
    expect(p).toContain("Nie mam informacji o godzinach otwarcia");
    expect(p).toMatch(/numer (telefonu )?recepcji/);

    // No rule noise when every day has real hours.
    const clean = buildSystemPrompt({
      tenantDisplayName: "Testowa",
      clinicFacts: { hoursLines: ["Poniedziałek: 08:00-20:00"] },
    });
    expect(clean).not.toContain("ZASADA");
    expect(clean).not.toMatch(/EXCEPTION: days marked/);
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

  it("forbids invented doctor-service attribution (REGRESSION b2stomatologia.pl WS call: 'wszyscy nasi lekarze' do root canals, stated nowhere)", () => {
    // A bare roster (names without specializations) plus a priced service
    // chunk made the agent attribute the service to ALL doctors. The KB-side
    // guard alone is retrieval-dependent (the chunker split it away from
    // the names); this rule is in the prompt on every turn.
    const prompt = buildSystemPrompt({ tenantDisplayName: "Testowa Klinika" });
    expect(prompt).toMatch(/DOCTOR-SERVICE ATTRIBUTION/);
    expect(prompt).toContain("wszyscy nasi lekarze");
    expect(prompt).toMatch(/never claim|NEVER claim/i);
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

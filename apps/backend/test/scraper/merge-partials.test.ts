import { describe, it, expect } from "vitest";
import { mergePartials } from "../../src/scraper/merge-partials.js";
import type { ScraperOutput } from "@ai-receptionist/contracts";

const base = (overrides: Partial<ScraperOutput> = {}): ScraperOutput => ({
  sourceUrl: "https://klinika.pl",
  scrapedAt: "2026-05-28T10:00:00.000Z",
  tenant: { name: "Klinika" },
  staff: [],
  services: [],
  faq: [],
  hasUnknownPrices: false,
  ...overrides,
});

describe("mergePartials", () => {
  it("returns the single input when given one partial", () => {
    const a = base({ tenant: { name: "Klinika A", phone: "+48 22 111 11 11" } });
    expect(mergePartials([a])).toEqual(a);
  });

  it("throws when given zero partials", () => {
    expect(() => mergePartials([])).toThrow(/at least one partial/i);
  });

  it("takes sourceUrl + scrapedAt from the first partial", () => {
    const a = base({ sourceUrl: "https://a.pl", scrapedAt: "2026-05-28T10:00:00.000Z" });
    const b = base({ sourceUrl: "https://b.pl", scrapedAt: "2026-05-28T11:00:00.000Z" });
    const merged = mergePartials([a, b]);
    expect(merged.sourceUrl).toBe("https://a.pl");
    expect(merged.scrapedAt).toBe("2026-05-28T10:00:00.000Z");
  });

  it("tenant: first non-empty wins per field", () => {
    const a = base({ tenant: { name: "Klinika", address: "", phone: "+48 22 111" } });
    const b = base({
      tenant: { name: "Klinika B", address: "ul. Polna 3", phone: "+48 22 222" },
    });
    const m = mergePartials([a, b]);
    expect(m.tenant.name).toBe("Klinika");
    expect(m.tenant.address).toBe("ul. Polna 3");
    expect(m.tenant.phone).toBe("+48 22 111");
  });

  it("tenant.hours: per-day first non-empty wins", () => {
    const a = base({
      tenant: { name: "K", hours: { monday: "9-17", tuesday: "" } },
    });
    const b = base({
      tenant: {
        name: "K",
        hours: { monday: "10-18", tuesday: "8-16", wednesday: "9-15" },
      },
    });
    const m = mergePartials([a, b]);
    expect(m.tenant.hours?.monday).toBe("9-17");
    expect(m.tenant.hours?.tuesday).toBe("8-16");
    expect(m.tenant.hours?.wednesday).toBe("9-15");
  });

  it("staff: dedup by case-insensitive name, prefer entry with specialization", () => {
    const a = base({ staff: [{ name: "Dr. Jan Kowalski", languages: [] }] });
    const b = base({
      staff: [
        { name: "dr. jan kowalski", specialization: "Implantology", languages: ["en"] },
      ],
    });
    const m = mergePartials([a, b]);
    expect(m.staff).toHaveLength(1);
    expect(m.staff[0]?.specialization).toBe("Implantology");
    expect(m.staff[0]?.languages).toEqual(["en"]);
  });

  it("staff: dedup is diacritic-insensitive (Łukasz ≡ Lukasz)", () => {
    const a = base({ staff: [{ name: "Dr. Łukasz Nowak", languages: [] }] });
    const b = base({
      staff: [{ name: "Dr. Lukasz Nowak", specialization: "Surgery", languages: [] }],
    });
    const m = mergePartials([a, b]);
    expect(m.staff).toHaveLength(1);
    expect(m.staff[0]?.specialization).toBe("Surgery");
  });

  it("services: dedup by name, prefer entry with concrete price over unknown", () => {
    const a = base({
      services: [
        {
          name: "Implant Straumann",
          synonyms: [],
          nfzCovered: "unknown",
          price: { currency: "PLN", qualifier: "unknown" },
        },
      ],
    });
    const b = base({
      services: [
        {
          name: "implant straumann",
          synonyms: [],
          nfzCovered: "unknown",
          price: {
            currency: "PLN",
            display: "od 4000 PLN",
            min: 4000,
            qualifier: "from",
          },
        },
      ],
    });
    const m = mergePartials([a, b]);
    expect(m.services).toHaveLength(1);
    expect(m.services[0]?.price?.qualifier).toBe("from");
    expect(m.services[0]?.price?.min).toBe(4000);
  });

  it("services: keeps both when names differ even after dedup-key normalization", () => {
    const a = base({
      services: [{ name: "Endodoncja", synonyms: [], nfzCovered: "unknown" }],
    });
    const b = base({
      services: [{ name: "Leczenie kanałowe", synonyms: [], nfzCovered: "unknown" }],
    });
    const m = mergePartials([a, b]);
    expect(m.services).toHaveLength(2);
  });

  it("faq: dedup by question (case + diacritic insensitive)", () => {
    const a = base({ faq: [{ question: "Czy przyjmujecie NFZ?", answer: "Tak." }] });
    const b = base({
      faq: [{ question: "czy przyjmujecie nfz?", answer: "Tak, w pełnym zakresie." }],
    });
    const m = mergePartials([a, b]);
    expect(m.faq).toHaveLength(1);
    expect(m.faq[0]?.answer).toBe("Tak.");
  });

  it("hasUnknownPrices: ORs across partials", () => {
    const a = base({ hasUnknownPrices: false });
    const b = base({ hasUnknownPrices: true });
    const c = base({ hasUnknownPrices: false });
    expect(mergePartials([a, b, c]).hasUnknownPrices).toBe(true);
  });

  it("unsorted: concatenates non-empty with double newline", () => {
    const a = base({ unsorted: "note A" });
    const b = base({ unsorted: "" });
    const c = base({ unsorted: "note C" });
    expect(mergePartials([a, b, c]).unsorted).toBe("note A\n\nnote C");
  });

  it("description: first non-empty wins, truncated to 500 chars", () => {
    const long = "x".repeat(600);
    const a = base({ tenant: { name: "K", description: "" } });
    const b = base({ tenant: { name: "K", description: long } });
    const merged = mergePartials([a, b]);
    expect(merged.tenant.description?.length).toBe(500);
  });

  it("staff order: stable — first occurrence position preserved", () => {
    const a = base({
      staff: [
        { name: "A", languages: [] },
        { name: "B", languages: [] },
      ],
    });
    const b = base({
      staff: [
        { name: "C", languages: [] },
        { name: "a", specialization: "X", languages: [] },
      ],
    });
    const m = mergePartials([a, b]);
    expect(m.staff.map((s) => s.name.toLowerCase())).toEqual(["a", "b", "c"]);
  });

  it("services order: stable — first occurrence position preserved", () => {
    const a = base({
      services: [{ name: "Service1", synonyms: [], nfzCovered: "unknown" }],
    });
    const b = base({
      services: [
        { name: "Service2", synonyms: [], nfzCovered: "unknown" },
        { name: "service1", synonyms: [], nfzCovered: "unknown" },
      ],
    });
    const m = mergePartials([a, b]);
    expect(m.services.map((s) => s.name)).toEqual(["Service1", "Service2"]);
  });

  it("works with 4+ partials (typical batch count)", () => {
    const partials = Array.from({ length: 4 }, (_, i) =>
      base({
        services: [
          { name: `Service ${i}`, synonyms: [], nfzCovered: "unknown" as const },
        ],
      }),
    );
    const m = mergePartials(partials);
    expect(m.services).toHaveLength(4);
  });
});

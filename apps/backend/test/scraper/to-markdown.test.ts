import { describe, it, expect } from "vitest";
import { scraperOutputToMarkdown } from "../../src/scraper/to-markdown.js";
import type { ScraperOutput } from "@ai-receptionist/contracts";

const SAMPLE: ScraperOutput = {
  sourceUrl: "https://example-vet.pl",
  scrapedAt: "2026-05-17T12:00:00.000Z",
  tenant: {
    name: "Klinika Łapka",
    address: "ul. Marszałkowska 100, Warszawa",
    phone: "+48 22 555 12 34",
    email: "kontakt@lapka.pl",
    hours: {
      monday: "9:00-20:00",
      tuesday: "9:00-20:00",
      wednesday: "9:00-20:00",
      thursday: "9:00-20:00",
      friday: "9:00-20:00",
      saturday: "10:00-15:00",
    },
    description: "Klinika weterynaryjna w Śródmieściu.",
  },
  staff: [
    {
      name: "dr Anna Nowak",
      role: "lekarz",
      specialization: "chirurgia małych zwierząt",
      languages: ["polski", "angielski"],
    },
  ],
  services: [
    {
      name: "Konsultacja",
      synonyms: ["wizyta", "przegląd"],
      nfzCovered: "unknown",
      price: { amount: 180, currency: "PLN" },
      durationMinutes: 30,
    },
    {
      name: "Wizyta nocna",
      synonyms: ["pogotowie"],
      nfzCovered: "none",
      price: { amount: "unknown", currency: "PLN" },
    },
  ],
  faq: [
    {
      question: "Czy przyjmujecie nagłe przypadki?",
      answer: "Tak, w godzinach pracy.",
    },
  ],
  hasUnknownPrices: true,
};

describe("scraperOutputToMarkdown (W2.1 KB formatter)", () => {
  it("emits H2 sections in canonical order", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    const klinikaIdx = md.indexOf("## Klinika");
    const staffIdx = md.indexOf("## Lekarze i personel");
    const servicesIdx = md.indexOf("## Usługi i ceny");
    const faqIdx = md.indexOf("## FAQ");
    const metaIdx = md.indexOf("## Metadane");
    expect(klinikaIdx).toBeGreaterThan(-1);
    expect(staffIdx).toBeGreaterThan(klinikaIdx);
    expect(servicesIdx).toBeGreaterThan(staffIdx);
    expect(faqIdx).toBeGreaterThan(servicesIdx);
    expect(metaIdx).toBeGreaterThan(faqIdx);
  });

  it("front-loads service synonyms on the H3 heading", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("### Konsultacja (znane także jako: wizyta, przegląd)");
  });

  it("renders prices as 'Cena: X PLN' lines, not tables", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Cena: 180 PLN");
    expect(md).not.toContain("|"); // no markdown tables
  });

  it("marks unknown prices explicitly with the literal word", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Cena: unknown");
  });

  it("includes provenance metadata", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Źródło: https://example-vet.pl");
    expect(md).toContain("Data pobrania: 2026-05-17T12:00:00.000Z");
  });

  it("warns when hasUnknownPrices=true", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toMatch(/część cen oznaczona jako unknown/);
  });

  it("omits empty sections", () => {
    const minimal: ScraperOutput = {
      ...SAMPLE,
      staff: [],
      services: [],
      faq: [],
    };
    const md = scraperOutputToMarkdown(minimal);
    expect(md).not.toContain("## Lekarze i personel");
    expect(md).not.toContain("## Usługi i ceny");
    expect(md).not.toContain("## FAQ");
    expect(md).toContain("## Klinika");
    expect(md).toContain("## Metadane");
  });

  it("includes staff languages when present", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("dr Anna Nowak");
    expect(md).toContain("języki: polski, angielski");
  });
});

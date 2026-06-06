import { describe, it, expect } from "vitest";
import { ScraperOutputSchema } from "@ai-receptionist/contracts";
import {
  consolidate,
  CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES,
} from "../../src/scraper/consolidate.js";
import { LLMClient, type LLMProvider, type GenerateJsonArgs } from "../../src/lib/llm.js";

const noSleep = () => Promise.resolve();

function provider(impl: LLMProvider["generateJson"]): LLMProvider {
  return { generateJson: impl };
}

const VALID_OUTPUT = {
  sourceUrl: "https://example-vet.pl",
  scrapedAt: "2026-05-16T13:00:00.000Z",
  tenant: { name: "Klinika Weterynaryjna Łapka" },
  staff: [{ name: "dr Maria Nowak", languages: [] }],
  services: [
    {
      name: "Konsultacja",
      synonyms: [],
      nfzCovered: "unknown",
      price: { currency: "PLN", display: "180 PLN", min: 180, max: 180, qualifier: "exact" },
    },
    {
      name: "Wizyta nocna",
      synonyms: [],
      nfzCovered: "unknown",
      price: { currency: "PLN", qualifier: "unknown" },
    },
  ],
  faq: [],
  hasUnknownPrices: true,
};

describe("scraper.consolidate (W2.1)", () => {
  it("returns Zod-validated ScraperOutput on happy path", async () => {
    const llm = new LLMClient(
      provider(async () => ({ text: JSON.stringify(VALID_OUTPUT) })),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    const out = await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [
        { url: "https://example-vet.pl", markdown: "# Łapka\n## Cennik\nKonsultacja 180 PLN" },
      ],
      llm,
    });

    expect(ScraperOutputSchema.safeParse(out).success).toBe(true);
    expect(out.tenant.name).toBe("Klinika Weterynaryjna Łapka");
    expect(out.services).toHaveLength(2);
  });

  it("system prompt forbids inventing prices and instructs unknown marker", async () => {
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured.toLowerCase()).toMatch(/do not invent/);
    expect(captured.toLowerCase()).toMatch(/unknown/);
    expect(CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES).toMatch(/unknown/i);
  });

  it("system prompt pins the output language to Polish (REGRESSION dci.waw.pl: Russian-primary source site)", async () => {
    // dci.waw.pl serves Russian content on unprefixed paths and Polish
    // under _pl suffixes. Without an explicit output-language rule the
    // consolidation can emit Russian descriptions into a KB read aloud
    // by a Polish-speaking agent.
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured).toMatch(/OUTPUT LANGUAGE: POLISH/);
    expect(captured.toLowerCase()).toMatch(/translate/);
  });

  it("system prompt demands full day-range expansion for hours (REGRESSION dci.waw.pl: 'Пн-Пт 9-20' → only mon/tue/wed emitted)", async () => {
    // The site footer published Mon-Fri + Sat hours + Sunday-closed; the
    // consolidation emitted monday/tuesday/wednesday and stopped. The
    // agent then 'knew' the clinic is closed Thu-Sun — worse than not
    // knowing. The prompt must force expansion of EVERY day in a range
    // plus explicit saturday/sunday.
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured).toMatch(/HOURS EXTRACTION/);
    expect(captured).toMatch(/EVERY day/);
    expect(captured.toLowerCase()).toMatch(/saturday/);
    expect(captured.toLowerCase()).toMatch(/sunday/);
  });

  it("Gemini-side schema REQUIRES all 7 days in hours (REGRESSION: prompt rules alone did not stop the mon/tue/wed lazy fill)", async () => {
    // 3 sites, 3 runs, 2 models: with all-optional day fields the model
    // expanded "pon-pt" to monday/tuesday/wednesday and stopped — even
    // AFTER the HOURS EXTRACTION RULES prompt landed (dentus run,
    // 2026-06-06 13:47Z). Same fix as the price display/qualifier
    // pattern: constrained decoding, not prompt hope. Unknown days are
    // emitted as "brak danych", closed days as "zamknięte".
    let capturedSchema: unknown;
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        capturedSchema = args.jsonSchema;
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    const hours = (
      capturedSchema as {
        properties: { tenant: { properties: { hours: { required?: string[] } } } };
      }
    ).properties.tenant.properties.hours;
    expect(hours.required).toEqual(
      expect.arrayContaining([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    );
  });

  it("system prompt defines the brak-danych / zamknięte conventions for unknown and closed days", async () => {
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured).toMatch(/brak danych/);
    expect(captured).toMatch(/zamknięte/);
  });

  it("system prompt covers glued price rows and price disclaimers (REGRESSION annadentalclinic.com /cennik: 44 price mentions → 0 extracted)", async () => {
    // Firecrawl flattens two-column price tables into glued runs
    // ("Przegląd uzębienia150 zł", "Licówka porcelanowaod 2 500 zł") and
    // the page adds "podane przykładowe ceny mają formę informacyjną".
    // The never-invent-primed model extracted ZERO of 44 visible prices.
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured).toMatch(/GLUED/);
    expect(captured).toMatch(/uzębienia150/);
    expect(captured.toLowerCase()).toMatch(/informacyjn|przykładowe/);
  });

  it("system prompt forbids price transfer between similarly-named services (REGRESSION dentus.szczecin.pl: Lakierowanie 150 zł copied onto Lakowanie)", async () => {
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    expect(captured).toMatch(/Never transfer/);
    expect(captured).toMatch(/Lakowanie/);
  });

  it("Gemini-side staff schema declares specializationSynonyms and the prompt explains it (auto patient phrasing for NEW agents)", async () => {
    // The deterministic taxonomy map in to-markdown.ts covers the dental
    // core; the consolidation LLM generates patient phrasings for anything
    // unmapped, so every new agent's roster is retrieval-ready without
    // hand-extending the map.
    let captured = "";
    let capturedSchema: unknown;
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.system ?? "";
        capturedSchema = args.jsonSchema;
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
    });

    const staffItem = (
      capturedSchema as {
        properties: {
          staff: { items: { properties: Record<string, unknown>; required?: string[] } };
        };
      }
    ).properties.staff.items;
    expect(staffItem.properties).toHaveProperty("specializationSynonyms");
    expect(staffItem.required).toContain("specializationSynonyms");
    expect(captured).toMatch(/specializationSynonyms/);
    expect(captured.toLowerCase()).toMatch(/pacjent|patient/);
  });

  it("stamps scrapedAt deterministically — model-emitted dates are hallucinated (REGRESSION: '2024-07-29' on a 2026 run)", async () => {
    const llm = new LLMClient(
      provider(async () => ({
        text: JSON.stringify({ ...VALID_OUTPUT, scrapedAt: "2024-07-29T12:00:00.000Z" }),
      })),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    const fixedNow = new Date("2026-06-06T10:00:00.000Z");
    const out = await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "# x" }],
      llm,
      now: () => fixedNow,
    });

    expect(out.scrapedAt).toBe("2026-06-06T10:00:00.000Z");
  });

  it("price-dropout triggers batched retry + merge (REGRESSION mas-stomatologia.pl: 36-page input, cennik scraped clean, 0/43 prices extracted by 2.5-pro single-shot)", async () => {
    // The input visibly carried dozens of "- Konsultacja 100 zł" rows and
    // the output named the cennik's services — with every price object
    // omitted. Not scale-dependent (MAS @352k chars failed; Anna @529k
    // succeeded) and not the fallback model (no LLMClient warnings → pro,
    // attempt 1). Detector: price signals in the INPUT vs priced services
    // in the OUTPUT; on dropout, re-run in batched mode (2-page probe
    // extracted 75/75) and mergePartials.
    const cennikPage = {
      url: "https://x.pl/cennik",
      markdown: "## Cennik\n- Konsultacja 100 zł\n- Znieczulenie 50 zł\n- Próchnica 350 zł",
    };
    const teamPage = {
      url: "https://x.pl/zespol",
      markdown: "## Zespół\ndr Maria Nowak\n- Wybielanie 600 zł\n- Korona 1200 zł",
    };

    const pricelessFull = {
      ...VALID_OUTPUT,
      services: [
        { name: "Konsultacja", synonyms: [], nfzCovered: "unknown" },
        { name: "Wybielanie", synonyms: [], nfzCovered: "unknown" },
      ],
    };
    const pricedPartial = (name: string, price: number) => ({
      ...VALID_OUTPUT,
      services: [
        {
          name,
          synonyms: [],
          nfzCovered: "unknown",
          price: {
            currency: "PLN",
            display: `${price} zł`,
            min: price,
            max: price,
            qualifier: "exact",
          },
        },
      ],
    });

    let calls = 0;
    const llm = new LLMClient(
      provider(async () => {
        calls++;
        if (calls === 1) return { text: JSON.stringify(pricelessFull) };
        if (calls === 2) return { text: JSON.stringify(pricedPartial("Konsultacja", 100)) };
        return { text: JSON.stringify(pricedPartial("Wybielanie", 600)) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    const out = await consolidate({
      rootUrl: "https://x.pl",
      pages: [cennikPage, teamPage],
      llm,
      batchCharBudget: 10, // force one page per batch
    });

    expect(calls).toBe(3); // 1 single-shot + 2 batches
    const priced = out.services.filter((s) => s.price && s.price.qualifier !== "unknown");
    expect(priced.map((s) => s.name).sort()).toEqual(["Konsultacja", "Wybielanie"]);
  });

  it("no batched retry when the single shot already extracts prices", async () => {
    let calls = 0;
    const llm = new LLMClient(
      provider(async () => {
        calls++;
        return { text: JSON.stringify(VALID_OUTPUT) }; // has 1 priced service
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );
    await consolidate({
      rootUrl: "https://x.pl",
      pages: [
        { url: "https://x.pl/cennik", markdown: "- A 100 zł\n- B 200 zł\n- C 300 zł" },
        { url: "https://x.pl/b", markdown: "y" },
      ],
      llm,
    });
    expect(calls).toBe(1);
  });

  it("no batched retry when the site publishes no prices (dentus-style natural gap)", async () => {
    const priceless = {
      ...VALID_OUTPUT,
      services: [{ name: "Konsultacja", synonyms: [], nfzCovered: "unknown" }],
    };
    let calls = 0;
    const llm = new LLMClient(
      provider(async () => {
        calls++;
        return { text: JSON.stringify(priceless) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );
    await consolidate({
      rootUrl: "https://x.pl",
      pages: [
        { url: "https://x.pl/uslugi", markdown: "Oferujemy leczenie." },
        { url: "https://x.pl/zespol", markdown: "dr Nowak" },
      ],
      llm,
    });
    expect(calls).toBe(1);
  });

  it("retries via LLMClient when first response is malformed", async () => {
    let n = 0;
    const llm = new LLMClient(
      provider(async () => {
        n++;
        if (n === 1) return { text: "garbage" };
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 2 },
    );

    const out = await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [{ url: "https://example-vet.pl", markdown: "x" }],
      llm,
    });

    expect(out.tenant.name).toBe("Klinika Weterynaryjna Łapka");
    expect(n).toBe(2);
  });

  it("rejects when validation never succeeds across fallback chain", async () => {
    const llm = new LLMClient(
      provider(async () => ({ text: JSON.stringify({ wrong: "shape" }) })),
      { sleep: noSleep, defaultMaxRetries: 1 },
    );

    await expect(
      consolidate({
        rootUrl: "https://example-vet.pl",
        pages: [{ url: "https://example-vet.pl", markdown: "x" }],
        llm,
      }),
    ).rejects.toThrow(/exhausted/i);
  });

  it("forwards user content containing all page markdowns + their URLs", async () => {
    let captured = "";
    const llm = new LLMClient(
      provider(async (args: GenerateJsonArgs) => {
        captured = args.user;
        return { text: JSON.stringify(VALID_OUTPUT) };
      }),
      { sleep: noSleep, defaultMaxRetries: 0 },
    );

    await consolidate({
      rootUrl: "https://example-vet.pl",
      pages: [
        { url: "https://example-vet.pl/cennik", markdown: "Cena: 200 PLN" },
        { url: "https://example-vet.pl/zespol", markdown: "dr Maria Nowak" },
      ],
      llm,
    });

    expect(captured).toContain("https://example-vet.pl/cennik");
    expect(captured).toContain("https://example-vet.pl/zespol");
    expect(captured).toContain("Cena: 200 PLN");
    expect(captured).toContain("dr Maria Nowak");
  });
});

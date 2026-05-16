import { describe, it, expect } from "vitest";
import { ScraperOutputSchema } from "@ai-receptionist/contracts";
import { consolidate, CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES } from "../../src/scraper/consolidate.js";
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
      price: { amount: 180, currency: "PLN" },
    },
    {
      name: "Wizyta nocna",
      synonyms: [],
      nfzCovered: "unknown",
      price: { amount: "unknown", currency: "PLN" },
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

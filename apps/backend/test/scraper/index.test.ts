import { describe, it, expect } from "vitest";
import { scrapeAndConsolidate } from "../../src/scraper/index.js";
import { LLMClient, type LLMProvider, type GenerateJsonArgs } from "../../src/lib/llm.js";
import type { FirecrawlClient } from "../../src/scraper/firecrawl.js";

const VALID_OUTPUT = {
  sourceUrl: "https://example-vet.pl",
  scrapedAt: "2026-05-16T13:00:00.000Z",
  tenant: { name: "Klinika Łapka" },
  staff: [],
  services: [],
  faq: [],
  hasUnknownPrices: false,
};

const noSleep = () => Promise.resolve();

/**
 * Fake fetcher that always returns 200 with no Location header. Causes
 * detectPrimaryLanguage to return null (no redirect signal), which the
 * orchestrator falls back to "pl" for — same behavior as a plain .pl
 * clinic with no language prefix. Keeps tests hermetic (no real
 * network calls).
 */
const noRedirectFetcher: typeof fetch = (async () =>
  new Response(null, { status: 200 })) as typeof fetch;

function makeLlm(captureUser?: (s: string) => void): LLMClient {
  const provider: LLMProvider = {
    async generateJson(args: GenerateJsonArgs) {
      captureUser?.(args.user);
      return { text: JSON.stringify(VALID_OUTPUT) };
    },
  };
  return new LLMClient(provider, { sleep: noSleep, defaultMaxRetries: 0 });
}

describe("scrapeAndConsolidate (W2.1 orchestrator)", () => {
  it("maps + scrapes (with root URL included) + consolidates", async () => {
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map(url: string) {
        expect(url).toBe("https://example-vet.pl");
        return ["https://example-vet.pl/cennik", "https://example-vet.pl/zespol"];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: `# ${url}` };
      },
    };
    let userPrompt = "";
    const llm = makeLlm((u) => (userPrompt = u));

    const out = await scrapeAndConsolidate({
      url: "https://example-vet.pl",
      firecrawl,
      llm,
      maxPages: 5,
      concurrency: 2,
      fetcher: noRedirectFetcher,
    });

    expect(out.tenant.name).toBe("Klinika Łapka");
    expect(scraped).toEqual(
      expect.arrayContaining([
        "https://example-vet.pl",
        "https://example-vet.pl/cennik",
        "https://example-vet.pl/zespol",
      ]),
    );
    expect(userPrompt).toContain("https://example-vet.pl/cennik");
    expect(userPrompt).toContain("https://example-vet.pl/zespol");
  });

  it("respects maxPages cap", async () => {
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        return [
          "https://x.pl/1",
          "https://x.pl/2",
          "https://x.pl/3",
          "https://x.pl/4",
          "https://x.pl/5",
        ];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: "x" };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm(),
      maxPages: 3,
      fetcher: noRedirectFetcher,
    });

    expect(scraped).toHaveLength(3);
  });

  it("drops empty-markdown pages from consolidate input", async () => {
    let userPrompt = "";
    const firecrawl: FirecrawlClient = {
      async map() {
        return ["https://x.pl/empty"];
      },
      async scrape(url: string) {
        if (url === "https://x.pl/empty") return { url, markdown: "" };
        return { url, markdown: "real" };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm((u) => (userPrompt = u)),
      fetcher: noRedirectFetcher,
    });

    expect(userPrompt).not.toContain("https://x.pl/empty");
    expect(userPrompt).toContain("https://x.pl");
  });
});

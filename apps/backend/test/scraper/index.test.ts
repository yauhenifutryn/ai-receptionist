import { describe, it, expect } from "vitest";
import { scrapeAndConsolidate, MIN_PAGE_CHARS } from "../../src/scraper/index.js";
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

/** Realistic page body — must clear MIN_PAGE_CHARS so it reaches consolidation. */
const pageBody = (url: string) => `# ${url}\n\n${"Treść strony kliniki. ".repeat(20)}`;

/**
 * Fake fetcher that always returns 200 with no Location header. Causes
 * detectPrimaryLanguage to return null (no redirect signal), which the
 * orchestrator falls back to "pl" for — same behavior as a plain .pl
 * clinic with no language prefix. Keeps tests hermetic (no real
 * network calls).
 */
const noRedirectFetcher: typeof fetch = (async () =>
  new Response(null, { status: 200 })) as typeof fetch;

/**
 * Fake LLM that answers BOTH pipeline calls:
 *   - rerank prompts ("Business root URL: …") → scores from `rerankScores`
 *     (default 0.9 — "everything looks relevant"), or throws when
 *     `rerankScores` is null (rerank outage → orchestrator must fall back
 *     to map order);
 *   - consolidation prompts → VALID_OUTPUT.
 */
function makeLlm(opts?: {
  captureUser?: (s: string) => void;
  captureSystem?: (s: string) => void;
  rerankScores?: Record<string, number> | null;
}): LLMClient {
  const provider: LLMProvider = {
    async generateJson(args: GenerateJsonArgs) {
      if (args.user.startsWith("Business root URL:")) {
        if (opts?.rerankScores === null) throw new Error("rerank outage (test)");
        const urls = args.user
          .split("\n")
          .filter((l) => /^\d+\. /.test(l))
          .map((l) => l.replace(/^\d+\. /, ""));
        return {
          text: JSON.stringify({
            ranked: urls.map((u) => ({
              url: u,
              score: opts?.rerankScores?.[u] ?? 0.9,
              reason: "test",
            })),
          }),
        };
      }
      opts?.captureUser?.(args.user);
      opts?.captureSystem?.(args.system);
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
        return { url, markdown: pageBody(url) };
      },
    };
    let userPrompt = "";
    const llm = makeLlm({ captureUser: (u) => (userPrompt = u) });

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
        return { url, markdown: pageBody(url) };
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

  it("drops sub-MIN_PAGE_CHARS pages from consolidate input (REGRESSION dci.waw.pl proxy-error stubs)", () => {
    // Firecrawl can return HTTP 200 whose markdown is an infra error
    // ("Invalid upstream proxy credentials", 42 chars). Such stubs must
    // never reach the consolidation LLM as if they were page content.
    expect(MIN_PAGE_CHARS).toBeGreaterThanOrEqual(100);
  });

  it("excludes proxy-error stub pages and empty pages from the consolidation prompt", async () => {
    let userPrompt = "";
    const firecrawl: FirecrawlClient = {
      async map() {
        return ["https://x.pl/stub", "https://x.pl/empty", "https://x.pl/real"];
      },
      async scrape(url: string) {
        if (url === "https://x.pl/stub")
          return { url, markdown: "Invalid upstream proxy credentials" };
        if (url === "https://x.pl/empty") return { url, markdown: "" };
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm({ captureUser: (u) => (userPrompt = u) }),
      fetcher: noRedirectFetcher,
    });

    expect(userPrompt).not.toContain("https://x.pl/stub");
    expect(userPrompt).not.toContain("https://x.pl/empty");
    expect(userPrompt).toContain("https://x.pl/real");
  });

  it("tolerates a per-page scrape failure: skips the page, still consolidates the rest (REGRESSION: one 408 killed the whole provision)", async () => {
    let userPrompt = "";
    const reported: Array<{ url: string; chars: number; error?: string }> = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        return ["https://x.pl/slow", "https://x.pl/ok"];
      },
      async scrape(url: string) {
        if (url === "https://x.pl/slow")
          throw new Error('Firecrawl /v1/scrape failed: 408 {"code":"SCRAPE_TIMEOUT"}');
        return { url, markdown: pageBody(url) };
      },
    };

    const out = await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm({ captureUser: (u) => (userPrompt = u) }),
      fetcher: noRedirectFetcher,
      onPage: (p) => reported.push(p),
    });

    expect(out.tenant.name).toBe("Klinika Łapka");
    expect(userPrompt).not.toContain("https://x.pl/slow");
    expect(userPrompt).toContain("https://x.pl/ok");
    const failed = reported.find((p) => p.url === "https://x.pl/slow");
    expect(failed?.error).toContain("408");
    const ok = reported.find((p) => p.url === "https://x.pl/ok");
    expect(ok?.chars).toBeGreaterThan(0);
    expect(ok?.error).toBeUndefined();
  });

  it("upgrades same-host http map links to https before scraping (REGRESSION dci.waw.pl)", async () => {
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        return ["http://dci.waw.pl/price", "http://dci.waw.pl/about"];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://dci.waw.pl",
      firecrawl,
      llm: makeLlm(),
      fetcher: noRedirectFetcher,
    });

    expect(scraped).toEqual(
      expect.arrayContaining(["https://dci.waw.pl/price", "https://dci.waw.pl/about"]),
    );
    expect(scraped.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("dedupes www/naked variants of the same page before scraping", async () => {
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        return [
          "https://www.dentus.szczecin.pl/kontakt",
          "https://dentus.szczecin.pl/kontakt",
          "https://www.dentus.szczecin.pl/zespol",
        ];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://dentus.szczecin.pl",
      firecrawl,
      llm: makeLlm(),
      fetcher: noRedirectFetcher,
    });

    const kontaktVariants = scraped.filter((u) => u.includes("/kontakt"));
    expect(kontaktVariants).toHaveLength(1);
  });

  it("retries the map once when it returns 0 links (observed transient empty map)", async () => {
    let mapCalls = 0;
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        mapCalls++;
        return mapCalls === 1 ? [] : ["https://x.pl/cennik"];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm(),
      fetcher: noRedirectFetcher,
    });

    expect(mapCalls).toBe(2);
    expect(scraped).toContain("https://x.pl/cennik");
  });

  it("reranks candidates with the LLM: drops low-scored junk when enough pages score above threshold (REGRESSION dentus.szczecin.pl: 25 map-order slots eaten by blog posts)", async () => {
    const scraped: string[] = [];
    const contentUrls = Array.from({ length: 9 }, (_, i) => `https://x.pl/uslugi/${i}`);
    const junk = "https://x.pl/blog/mononukleoza-gdy-pocalunek";
    const firecrawl: FirecrawlClient = {
      async map() {
        // Junk FIRST in map order — the old slice(0, maxPages) would keep it.
        return [junk, ...contentUrls];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm({ rerankScores: { [junk]: 0.05 } }),
      maxPages: 8,
      fetcher: noRedirectFetcher,
    });

    expect(scraped).not.toContain(junk);
    expect(scraped).toContain("https://x.pl/uslugi/0");
  });

  it("always scrapes the root URL even if the reranker scores it low (hours live in footers)", async () => {
    const scraped: string[] = [];
    const contentUrls = Array.from({ length: 10 }, (_, i) => `https://x.pl/uslugi/${i}`);
    const firecrawl: FirecrawlClient = {
      async map() {
        return contentUrls;
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm({ rerankScores: { "https://x.pl": 0.05 } }),
      maxPages: 8,
      fetcher: noRedirectFetcher,
    });

    expect(scraped).toContain("https://x.pl");
  });

  it("falls back to map order when the rerank itself fails (scrape more, not less)", async () => {
    const scraped: string[] = [];
    const firecrawl: FirecrawlClient = {
      async map() {
        return ["https://x.pl/cennik", "https://x.pl/zespol"];
      },
      async scrape(url: string) {
        scraped.push(url);
        return { url, markdown: pageBody(url) };
      },
    };

    const out = await scrapeAndConsolidate({
      url: "https://x.pl",
      firecrawl,
      llm: makeLlm({ rerankScores: null }),
      fetcher: noRedirectFetcher,
    });

    expect(out.tenant.name).toBe("Klinika Łapka");
    expect(scraped).toEqual(
      expect.arrayContaining(["https://x.pl", "https://x.pl/cennik", "https://x.pl/zespol"]),
    );
  });
});

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  consolidate,
  createFirecrawlClient,
  scraperOutputToMarkdown,
  shouldScrape,
  DEFAULT_RELEVANCE_QUERY,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { buildSystemPrompt } from "@ai-receptionist/backend/prompts";
import type { FirecrawlPage } from "@ai-receptionist/backend/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  url: z.string().url(),
  /** Optional override for the relevance ranking query passed to Firecrawl map. */
  searchQuery: z.string().min(1).max(500).optional(),
  /** Cap on pages to scrape after ranking + heuristic filtering. */
  maxPages: z.number().int().positive().max(40).default(15),
});

const DEFAULT_CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { url, searchQuery, maxPages } = parsed.data;

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: "firecrawl_api_key_missing" }, { status: 500 });
  }
  if (!geminiKey) {
    return NextResponse.json({ error: "gemini_api_key_missing" }, { status: 500 });
  }

  const firecrawl = createFirecrawlClient({ apiKey: firecrawlKey });
  const llm = new LLMClient(createGeminiProvider({ apiKey: geminiKey }), {
    defaultMaxRetries: 1,
  });

  // 1. Map the site with relevance ranking. Firecrawl returns URLs sorted by
  //    semantic match against `search`.
  let links: string[];
  try {
    links = await firecrawl.map(url, {
      search: searchQuery ?? DEFAULT_RELEVANCE_QUERY,
      limit: 100,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "firecrawl_map_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // 2. Apply heuristic blocklist (blog archives, wp-admin, binaries, etc.)
  //    so we don't burn credits scraping obvious junk.
  const ranked = [url, ...links.filter((l) => l !== url)];
  const filtered = ranked.filter(shouldScrape);
  const candidates = filtered.slice(0, maxPages);
  const droppedCount = ranked.length - filtered.length;

  // 2. Scrape each URL with bounded concurrency.
  let pages: FirecrawlPage[];
  try {
    pages = (
      await runWithConcurrency(candidates, DEFAULT_CONCURRENCY, (u) =>
        firecrawl.scrape(u).catch((e) => {
          console.warn("firecrawl.scrape failed", u, (e as Error).message);
          return { url: u, markdown: "" };
        }),
      )
    ).filter((p) => p.markdown.length > 0);
  } catch (e) {
    return NextResponse.json(
      { error: "firecrawl_scrape_failed", message: (e as Error).message },
      { status: 502 },
    );
  }
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "no_content_scraped", message: "Firecrawl returned 0 pages with markdown" },
      { status: 422 },
    );
  }

  // 3. Consolidate via Gemini Pro Preview into a ScraperOutput.
  let scraperOutput;
  try {
    scraperOutput = await consolidate({
      rootUrl: url,
      pages,
      llm,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "consolidate_failed",
        message: (e as Error).message,
        pagesScraped: pages.length,
      },
      { status: 502 },
    );
  }

  // 4. Render to knowledge.md + build system prompt.
  const knowledgeMarkdown = scraperOutputToMarkdown(scraperOutput);
  const systemPrompt = buildSystemPrompt({
    tenantDisplayName: scraperOutput.tenant.name,
  });

  return NextResponse.json(
    {
      suggestedTenantName: scraperOutput.tenant.name,
      knowledgeMarkdown,
      systemPrompt,
      scraperSummary: {
        sourceUrl: scraperOutput.sourceUrl,
        scrapedAt: scraperOutput.scrapedAt,
        urlsMapped: ranked.length,
        urlsDroppedByFilter: droppedCount,
        pagesScraped: pages.length,
        servicesCount: scraperOutput.services.length,
        staffCount: scraperOutput.staff.length,
        faqCount: scraperOutput.faq.length,
        hasUnknownPrices: scraperOutput.hasUnknownPrices,
      },
    },
    { status: 200 },
  );
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = index++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

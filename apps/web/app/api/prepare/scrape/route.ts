import { type NextRequest } from "next/server";
import { z } from "zod";
import {
  canonicalizeUrl,
  createFirecrawlClient,
  detectPrimaryLanguage,
  extractInternalLinks,
  filterCandidates,
  pickByScore,
  rerankUrls,
  DEFAULT_RELEVANCE_QUERY,
  type FirecrawlPage,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRAPE_FLOOR = 8;
const SCRAPE_CEILING_MAX = 50;
const RERANK_INPUT_CAP = 100;
const FIRECRAWL_MAP_LIMIT = 150;
const DEFAULT_CONCURRENCY = 3;

const BodySchema = z.object({
  url: z.string().url(),
  searchQuery: z.string().min(1).max(500).optional(),
  maxPages: z.number().int().min(SCRAPE_FLOOR).max(SCRAPE_CEILING_MAX).default(35),
  rerankThreshold: z.number().min(0).max(1).default(0.4),
});

export interface PrepareScrapeResponse {
  pages: FirecrawlPage[];
  detectedLanguage: string | null;
  primaryLanguage: string;
  urlsMapped: number;
  urlsDroppedByFilter: number;
  pagesScraped: number;
}

export async function POST(req: NextRequest) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return Response.json({ error: operator.body.error }, { status: operator.status });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { url, searchQuery, maxPages, rerankThreshold } = parsed.data;

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!firecrawlKey) {
    return Response.json({ error: "firecrawl_api_key_missing" }, { status: 500 });
  }
  if (!geminiKey) {
    return Response.json({ error: "gemini_api_key_missing" }, { status: 500 });
  }

  const firecrawl = createFirecrawlClient({ apiKey: firecrawlKey });
  const llm = new LLMClient(createGeminiProvider({ apiKey: geminiKey }), {
    defaultMaxRetries: 1,
  });

  const detectedPrimary = await detectPrimaryLanguage(url);
  const primaryLang = detectedPrimary ?? "pl";

  const links = await firecrawl.map(url, {
    search: searchQuery ?? DEFAULT_RELEVANCE_QUERY,
    limit: FIRECRAWL_MAP_LIMIT,
  });
  const ranked = [url, ...links.filter((l) => l !== url)];
  const filter = filterCandidates(ranked, primaryLang);
  const afterFilter = filter.kept;

  const toRerank = afterFilter.slice(0, RERANK_INPUT_CAP);
  const reranked = await rerankUrls({ rootUrl: url, urls: toRerank, llm });
  const candidates = pickByScore(reranked, {
    threshold: rerankThreshold,
    floor: SCRAPE_FLOOR,
    ceiling: maxPages,
  });

  const firstPass = await scrapeAll(firecrawl, candidates, DEFAULT_CONCURRENCY);
  const validFirstPass = firstPass.filter((p) => p.markdown.length > 0);

  // One discovery pass: pull internal links out of scraped markdown,
  // filter, rerank, scrape any new ones (subject to maxPages cap).
  const seenCanonical = new Set(
    validFirstPass.map((p) => canonicalizeUrl(p.url) ?? p.url),
  );
  const discovered = extractInternalLinks(validFirstPass, url);
  const newLinks = discovered.filter((u) => !seenCanonical.has(u));
  let discoveredPages: FirecrawlPage[] = [];
  if (newLinks.length > 0 && validFirstPass.length < maxPages) {
    const newFilter = filterCandidates(newLinks, primaryLang);
    if (newFilter.kept.length > 0) {
      const newReranked = await rerankUrls({
        rootUrl: url,
        urls: newFilter.kept.slice(0, RERANK_INPUT_CAP),
        llm,
      });
      const remainingBudget = maxPages - validFirstPass.length;
      const newCandidates = pickByScore(newReranked, {
        threshold: rerankThreshold,
        floor: 0,
        ceiling: remainingBudget,
      });
      if (newCandidates.length > 0) {
        const more = await scrapeAll(firecrawl, newCandidates, DEFAULT_CONCURRENCY);
        discoveredPages = more.filter((p) => p.markdown.length > 0);
      }
    }
  }

  const pages = [...validFirstPass, ...discoveredPages];

  if (pages.length === 0) {
    return Response.json(
      {
        error: "no_content_scraped",
        message:
          "Firecrawl returned 0 pages with markdown — site might block scrapers or have no content",
      },
      { status: 502 },
    );
  }

  const body: PrepareScrapeResponse = {
    pages,
    detectedLanguage: detectedPrimary,
    primaryLanguage: primaryLang,
    urlsMapped: ranked.length,
    urlsDroppedByFilter: filter.droppedJunk.length + filter.droppedTranslations.length,
    pagesScraped: pages.length,
  };
  return Response.json(body);
}

async function scrapeAll(
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  urls: string[],
  concurrency: number,
): Promise<FirecrawlPage[]> {
  const out: FirecrawlPage[] = new Array(urls.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      try {
        out[i] = await firecrawl.scrape(urls[i]!);
      } catch (e) {
        console.warn("firecrawl.scrape failed", urls[i], (e as Error).message);
        out[i] = { url: urls[i]!, markdown: "" };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

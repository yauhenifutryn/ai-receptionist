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
  type FirecrawlPage,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { getOperatorOrJsonError } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRAPE_FLOOR = 8;
const SCRAPE_CEILING_MAX = 50;
const RERANK_INPUT_CAP = 100;
const FIRECRAWL_MAP_LIMIT = 150;
const DEFAULT_CONCURRENCY = 3;
/** Cached page is reused if scraped within this window; clinic sites change,
 *  so a week-old page is re-scraped on the next provisioning run. */
const PAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  url: z.string().url(),
  searchQuery: z.string().min(1).max(500).optional(),
  maxPages: z.number().int().min(SCRAPE_FLOOR).max(SCRAPE_CEILING_MAX).default(35),
  rerankThreshold: z.number().min(0).max(1).default(0.4),
  /** Bypass the per-page cache: re-scrape every candidate from scratch and
   *  overwrite cached markdown. Wired to the UI's "Scrape from scratch". */
  forceFresh: z.boolean().default(false),
});

export interface PrepareScrapeResponse {
  pages: FirecrawlPage[];
  detectedLanguage: string | null;
  primaryLanguage: string;
  urlsMapped: number;
  urlsDroppedByFilter: number;
  pagesScraped: number;
  /** How many of the scraped pages came from the cache vs fresh Firecrawl. */
  pagesFromCache: number;
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
  const { url, searchQuery, maxPages, rerankThreshold, forceFresh } = parsed.data;

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

  // NO `search` param: Firecrawl's map-with-search collapses bot-protected
  // WordPress sites to a single URL (confirmed on exclusivedentalstudio.pl:
  // 99 URLs plain vs 1 with search). Relevance is handled downstream by
  // filterCandidates + rerankUrls, so the search filter is both redundant
  // and actively harmful. searchQuery is accepted for API compat but unused.
  void searchQuery;
  const links = await firecrawl.map(url, {
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

  const cache: PageCache = { supabase: operator.supabase, forceFresh, hits: 0 };
  const firstPass = await scrapeAll(firecrawl, candidates, DEFAULT_CONCURRENCY, cache);
  const validFirstPass = firstPass.filter((p) => p.markdown.length > 0);

  // One discovery pass: pull internal links out of scraped markdown,
  // filter, rerank, scrape any new ones (subject to maxPages cap).
  const seenCanonical = new Set(validFirstPass.map((p) => canonicalizeUrl(p.url) ?? p.url));
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
        const more = await scrapeAll(firecrawl, newCandidates, DEFAULT_CONCURRENCY, cache);
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
    pagesFromCache: cache.hits,
  };
  return Response.json(body);
}

interface PageCache {
  supabase: SupabaseClient;
  /** When true, ignore cached markdown and re-scrape every URL fresh. */
  forceFresh: boolean;
  /** Mutated as scrapeAll runs — counts pages served from cache. */
  hits: number;
}

interface CachedRow {
  url: string;
  markdown: string;
  scraped_at: string;
}

/**
 * Scrape `urls`, reusing the per-page cache (scraped_pages) for any URL
 * scraped within PAGE_CACHE_TTL_MS. Only cache misses (and, when forceFresh,
 * everything) hit Firecrawl. Successful fresh scrapes are written back to the
 * cache so the slow 408-prone pages are paid for at most once.
 *
 * Cache reads/writes are best-effort: a Supabase failure degrades to a plain
 * Firecrawl scrape, never an error.
 */
async function scrapeAll(
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  urls: string[],
  concurrency: number,
  cache: PageCache,
): Promise<FirecrawlPage[]> {
  const canonicalByIndex = urls.map((u) => canonicalizeUrl(u) ?? u);

  // Batch-read the cache once for all candidate URLs.
  const cached = new Map<string, string>();
  if (!cache.forceFresh) {
    try {
      const { data } = await cache.supabase
        .from("scraped_pages")
        .select("url, markdown, scraped_at")
        .in("url", Array.from(new Set(canonicalByIndex)));
      const cutoff = Date.now() - PAGE_CACHE_TTL_MS;
      for (const row of (data ?? []) as CachedRow[]) {
        if (new Date(row.scraped_at).getTime() >= cutoff && row.markdown.length > 0) {
          cached.set(row.url, row.markdown);
        }
      }
    } catch (e) {
      console.warn("scraped_pages cache read failed (non-fatal):", (e as Error).message);
    }
  }

  const out: FirecrawlPage[] = new Array(urls.length);
  const freshWrites: { url: string; markdown: string }[] = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const canonical = canonicalByIndex[i]!;
      const hit = cached.get(canonical);
      if (hit !== undefined) {
        out[i] = { url: urls[i]!, markdown: hit };
        cache.hits++;
        continue;
      }
      try {
        const page = await firecrawl.scrape(urls[i]!);
        out[i] = page;
        if (page.markdown.length > 0) {
          freshWrites.push({ url: canonical, markdown: page.markdown });
        }
      } catch (e) {
        console.warn("firecrawl.scrape failed", urls[i], (e as Error).message);
        out[i] = { url: urls[i]!, markdown: "" };
      }
    }
  });
  await Promise.all(workers);

  // Persist successful fresh scrapes for next time (best-effort upsert).
  if (freshWrites.length > 0) {
    try {
      await cache.supabase.from("scraped_pages").upsert(
        freshWrites.map((w) => ({
          url: w.url,
          markdown: w.markdown,
          scraped_at: new Date().toISOString(),
        })),
        { onConflict: "url" },
      );
    } catch (e) {
      console.warn("scraped_pages cache write failed (non-fatal):", (e as Error).message);
    }
  }

  return out;
}

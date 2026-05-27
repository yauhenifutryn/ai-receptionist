import type { ScraperOutput } from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import { consolidate } from "./consolidate.js";
import type { FirecrawlClient, FirecrawlPage } from "./firecrawl.js";
import { detectPrimaryLanguage, filterCandidates } from "./url-filter.js";

export { createFirecrawlClient } from "./firecrawl.js";
export {
  consolidate,
  CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES,
  PER_PAGE_CHAR_CAP,
} from "./consolidate.js";
export { scraperOutputToMarkdown } from "./to-markdown.js";
export {
  shouldScrape,
  dedupeByLanguage,
  detectLanguagePrefixes,
  detectPrimaryLanguage,
  filterCandidates,
  DEFAULT_RELEVANCE_QUERY,
  type FilterCandidatesResult,
} from "./url-filter.js";
export {
  rerankUrls,
  pickByScore,
  type RerankItem,
  type RerankArgs,
  type PickByScoreOptions,
} from "./llm-reranker.js";
export {
  reportCoverage,
  type CoverageReport,
  type CoverageWarning,
  type CoverageSeverity,
} from "./coverage.js";
export { extractInternalLinks } from "./discover-links.js";
export type { FirecrawlClient, FirecrawlPage, MapOptions } from "./firecrawl.js";

const DEFAULT_MAX_PAGES = 25;
const DEFAULT_CRAWL_CONCURRENCY = 3;

export interface ScrapeAndConsolidateArgs {
  url: string;
  firecrawl: FirecrawlClient;
  llm: LLMClient;
  maxPages?: number;
  concurrency?: number;
  /**
   * Injected fetcher for the primary-language detection HEAD call. Tests
   * pass a fake so they don't hit the real network. Production callers
   * omit this and global fetch is used.
   */
  fetcher?: typeof fetch;
}

export async function scrapeAndConsolidate(args: ScrapeAndConsolidateArgs): Promise<ScraperOutput> {
  // Detect the site's primary content language from its root redirect.
  // Falls back to "pl" if no clear signal (most Polish clinics) so the
  // dedupe behavior is unchanged for sites that worked under the old
  // hardcoded PRIMARY_LANG.
  const detectedPrimary = await detectPrimaryLanguage(args.url, args.fetcher);
  const primaryLang = detectedPrimary ?? "pl";

  const links = await args.firecrawl.map(args.url);
  const filter = filterCandidates(
    [args.url, ...links.filter((l) => l !== args.url)],
    primaryLang,
  );
  const candidates = filter.kept.slice(0, args.maxPages ?? DEFAULT_MAX_PAGES);

  const pages = await runWithConcurrency(
    candidates,
    args.concurrency ?? DEFAULT_CRAWL_CONCURRENCY,
    (u) => args.firecrawl.scrape(u),
  );

  return consolidate({
    rootUrl: args.url,
    pages: pages.filter((p): p is FirecrawlPage => p.markdown.length > 0),
    llm: args.llm,
  });
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

import type { ScraperOutput } from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import { consolidate } from "./consolidate.js";
import type { FirecrawlClient, FirecrawlPage } from "./firecrawl.js";

export { createFirecrawlClient } from "./firecrawl.js";
export { consolidate, CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES } from "./consolidate.js";
export { scraperOutputToMarkdown } from "./to-markdown.js";
export {
  shouldScrape,
  dedupeByLanguage,
  detectLanguagePrefixes,
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
export type { FirecrawlClient, FirecrawlPage, MapOptions } from "./firecrawl.js";

const DEFAULT_MAX_PAGES = 25;
const DEFAULT_CRAWL_CONCURRENCY = 3;

export interface ScrapeAndConsolidateArgs {
  url: string;
  firecrawl: FirecrawlClient;
  llm: LLMClient;
  maxPages?: number;
  concurrency?: number;
}

export async function scrapeAndConsolidate(
  args: ScrapeAndConsolidateArgs,
): Promise<ScraperOutput> {
  const links = await args.firecrawl.map(args.url);
  const candidates = [args.url, ...links.filter((l) => l !== args.url)]
    .slice(0, args.maxPages ?? DEFAULT_MAX_PAGES);

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

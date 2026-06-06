import type { ScraperOutput } from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import { consolidate } from "./consolidate.js";
import { extractInternalLinks } from "./discover-links.js";
import type { FirecrawlClient, FirecrawlPage } from "./firecrawl.js";
import { rerankUrls, pickByScore } from "./llm-reranker.js";
import {
  canonicalizeUrl,
  collapseUrlFamilies,
  dedupeByCanonicalUrl,
  detectPrimaryLanguage,
  filterCandidates,
  upgradeToRootScheme,
} from "./url-filter.js";

export { createFirecrawlClient } from "./firecrawl.js";
export {
  consolidate,
  CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES,
  PER_PAGE_CHAR_CAP,
} from "./consolidate.js";
export { scraperOutputToMarkdown } from "./to-markdown.js";
export {
  canonicalizeUrl,
  collapseUrlFamilies,
  dedupeByCanonicalUrl,
  shouldScrape,
  dedupeByLanguage,
  detectLanguagePrefixes,
  detectPrimaryLanguage,
  filterCandidates,
  upgradeToRootScheme,
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
export { mergePartials } from "./merge-partials.js";
export type { FirecrawlClient, FirecrawlPage, MapOptions } from "./firecrawl.js";

// 35 (wizard parity, was 25): on stub-heavy sites the extra margin is the
// difference between the hygiene/pricing pages making the cut or not.
const DEFAULT_MAX_PAGES = 35;
/**
 * 2026-06-06 batch incident: this was 3 while the Firecrawl plan's
 * maxConcurrency is 2 (verified via /v2/concurrency-check). The third
 * in-flight scrape queues server-side and the queue wait counts against
 * the 45s scrape timeout → 408 SCRAPE_TIMEOUT killed two of three
 * provisioning runs. Keep this at or below the plan's limit.
 */
const DEFAULT_CRAWL_CONCURRENCY = 2;
/**
 * Pages shorter than this never reach the consolidation LLM. Real pages
 * scraped with onlyMainContent:false always carry nav+footer chrome
 * (hundreds of chars); sub-200-char "pages" are infra error stubs —
 * observed: Firecrawl returning HTTP 200 whose markdown is literally
 * "Invalid upstream proxy credentials" (42 chars, dci.waw.pl batch).
 */
export const MIN_PAGE_CHARS = 200;
/** Mirror of the onboarding wizard's rerank defaults (prepare/scrape). */
const RERANK_THRESHOLD = 0.4;
const SCRAPE_FLOOR = 8;

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
  /**
   * Per-page observability: called once per scrape attempt with the
   * markdown length (0 + error message on failure). The 2026-06-06 batch
   * produced a 736-char KB with zero indication of which pages came back
   * empty — never again.
   */
  onPage?: (page: { url: string; chars: number; error?: string }) => void;
}

export async function scrapeAndConsolidate(args: ScrapeAndConsolidateArgs): Promise<ScraperOutput> {
  // Detect the site's primary content language from its root redirect.
  // Falls back to "pl" if no clear signal (most Polish clinics) so the
  // dedupe behavior is unchanged for sites that worked under the old
  // hardcoded PRIMARY_LANG.
  const detectedPrimary = await detectPrimaryLanguage(args.url, args.fetcher);
  const primaryLang = detectedPrimary ?? "pl";

  let links = await args.firecrawl.map(args.url);
  if (links.length === 0) {
    // Transient empty maps happen (observed: same site 626 → 0 → 626
    // links across minutes). One retry is 1 credit of insurance against
    // provisioning a root-page-only KB.
    links = await args.firecrawl.map(args.url);
  }

  // Firecrawl maps echo whatever scheme the site's sitemap declares;
  // scraping http:// through Firecrawl's proxy fails (see
  // upgradeToRootScheme). Upgrade before filtering so the canonical
  // dedupe also collapses http/https pairs.
  const upgraded = upgradeToRootScheme(args.url, links);
  const filter = filterCandidates(
    [args.url, ...upgraded.filter((l) => l !== args.url)],
    primaryLang,
  );
  // Deterministic candidate order (plain lexicographic). Firecrawl's map
  // order is unstable run-to-run (observed 626→0→626 links on
  // dentus.szczecin.pl within minutes), which made selection — and
  // therefore KB content — vary across identical runs. NO depth/topic
  // heuristics here: a depth-first variant crowded the rerank with
  // depth-1 campaign stubs (dentus-kids-1..17) and produced a 0-priced
  // KB. Every kept URL is scored by the chunked rerank; the LLM is the
  // only content judge.
  const deduped = collapseUrlFamilies(dedupeByCanonicalUrl(filter.kept)).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const maxPages = args.maxPages ?? DEFAULT_MAX_PAGES;

  // LLM rerank — same selection the onboarding wizard uses. Without it,
  // map-order slice(0, 25) filled all slots with blog posts on
  // dentus.szczecin.pl (kontakt sat at #29, zespol at #27). On rerank
  // failure the safe default is map order: scrape more, not less.
  const candidates = await selectCandidates(args, deduped, maxPages, SCRAPE_FLOOR);

  const scrapePass = (urls: string[]) =>
    runWithConcurrency(urls, args.concurrency ?? DEFAULT_CRAWL_CONCURRENCY, async (u) => {
      // Per-page tolerance: a single 408 on a slow page must degrade to
      // "page skipped", never abort the whole provisioning run (the
      // 2026-06-06 batch lost 2 of 3 clinics to exactly this).
      try {
        const page = await args.firecrawl.scrape(u);
        args.onPage?.({ url: u, chars: page.markdown.length });
        return page;
      } catch (e) {
        args.onPage?.({ url: u, chars: 0, error: (e as Error).message });
        return { url: u, markdown: "" };
      }
    });

  const firstPass = await scrapePass(candidates);
  const valid = firstPass.filter((p): p is FirecrawlPage => p.markdown.length >= MIN_PAGE_CHARS);

  // Discovery pass — Firecrawl maps are sitemap-driven and miss nav-only
  // pages (annadentalclinic.com publishes /cennik in the header nav but
  // not in the sitemap; the map-only run produced a 3-priced KB). Pull
  // internal links out of the scraped markdown, keep the new ones, rerank,
  // scrape. Discovery has its OWN bounded budget (≤ min(5, 20% of
  // maxPages) extra scrapes) on top of any leftover first-pass budget:
  // on sites whose sitemap already fills maxPages (annadentalclinic.com,
  // 10 team-profile pages), a leftover-only budget silently skipped the
  // one pass that can find the pricing page.
  if (valid.length > 0) {
    const discoveryBudget = Math.max(
      maxPages - valid.length,
      Math.min(5, Math.ceil(maxPages * 0.2)),
    );
    const seen = new Set(candidates.map((c) => canonicalizeUrl(c) ?? c));
    const discovered = extractInternalLinks(valid, args.url)
      .map((u) => upgradeToRootScheme(args.url, [u])[0]!)
      .filter((u) => !seen.has(canonicalizeUrl(u) ?? u));
    const discKept = collapseUrlFamilies(
      dedupeByCanonicalUrl(filterCandidates(discovered, primaryLang).kept),
    );
    if (discKept.length > 0 && discoveryBudget > 0) {
      const discCandidates = await selectCandidates(args, discKept, discoveryBudget, 0);
      if (discCandidates.length > 0) {
        const more = await scrapePass(discCandidates);
        valid.push(...more.filter((p) => p.markdown.length >= MIN_PAGE_CHARS));
      }
    }
  }

  return consolidate({
    rootUrl: args.url,
    pages: valid,
    llm: args.llm,
  });
}

/**
 * Rerank-and-pick with sorted-order fallback. The FULL url list is scored
 * (rerankUrls chunks internally), so selection never depends on which
 * URLs happen to land inside an arbitrary input cap. `floor > 0` also
 * force-includes the root page — clinics hide hours/phone in its footer
 * (wadental.pl), and a low rerank score must not drop it.
 */
async function selectCandidates(
  args: ScrapeAndConsolidateArgs,
  urls: string[],
  ceiling: number,
  floor: number,
): Promise<string[]> {
  if (urls.length === 0 || ceiling <= 0) return [];
  let picked: string[];
  try {
    const reranked = await rerankUrls({
      rootUrl: args.url,
      urls,
      llm: args.llm,
    });
    picked = pickByScore(reranked, { threshold: RERANK_THRESHOLD, floor, ceiling });
  } catch {
    return urls.slice(0, ceiling);
  }
  if (floor > 0) {
    const rootCanonical = canonicalizeUrl(args.url);
    if (!picked.some((c) => canonicalizeUrl(c) === rootCanonical)) {
      picked = [args.url, ...picked].slice(0, Math.max(ceiling, 1));
    }
  }
  return picked;
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

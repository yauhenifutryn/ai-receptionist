// Smoke test: exercises the chunked-provisioning pipeline end-to-end
// against real Firecrawl + Gemini, bypassing the operator-auth wall on
// the Vercel routes. Validates that:
//   1. Scrape phase returns pages (with current primaryLang detection)
//   2. Each batch consolidates inside Vercel's 300s ceiling
//   3. mergePartials produces a usable ScraperOutput
//   4. Coverage/finalize step runs cleanly
//
// Usage: node scripts/smoke-chunked-pipeline.mjs <url>
import { performance } from "node:perf_hooks";
// Run with: node --env-file=.env.local scripts/smoke-chunked-pipeline.mjs <url>

const URL_ARG = process.argv[2];
if (!URL_ARG) {
  console.error("usage: node scripts/smoke-chunked-pipeline.mjs <url>");
  process.exit(2);
}

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!FIRECRAWL_KEY || !GEMINI_KEY) {
  console.error("FIRECRAWL_API_KEY and GEMINI_API_KEY must be set in .env.local");
  process.exit(2);
}

const BATCH_SIZE = 3;
const PARALLELISM = 4;
const MAX_PAGES = 35;

const t0 = performance.now();
const log = (phase, msg) =>
  console.log(`[${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s][${phase}] ${msg}`);

const {
  createFirecrawlClient,
  detectPrimaryLanguage,
  filterCandidates,
  pickByScore,
  rerankUrls,
  extractInternalLinks,
  canonicalizeUrl,
  DEFAULT_RELEVANCE_QUERY,
  consolidate,
  scraperOutputToMarkdown,
  reportCoverage,
} = await import("./../apps/backend/dist/scraper/index.js");
const { mergePartials } = await import("./../apps/backend/dist/scraper/merge-partials.js");
const { LLMClient } = await import("./../apps/backend/dist/lib/llm.js");
const { createGeminiProvider } = await import("./../apps/backend/dist/lib/gemini-provider.js");
const { buildSystemPrompt, extractPolishCity } =
  await import("./../apps/backend/dist/prompts/system-prompt.js");

const firecrawl = createFirecrawlClient({ apiKey: FIRECRAWL_KEY });
const llm = new LLMClient(createGeminiProvider({ apiKey: GEMINI_KEY }), { defaultMaxRetries: 1 });

// ── Phase 1: scrape ────────────────────────────────────────────────────
log("scrape", `Starting scrape of ${URL_ARG}`);
const detectedPrimary = await detectPrimaryLanguage(URL_ARG);
const primaryLang = detectedPrimary ?? "pl";
log(
  "scrape",
  `Primary language: ${primaryLang} (${detectedPrimary ? "from root redirect" : "default"})`,
);

// No `search` — it collapses bot-protected WP sites to 1 URL. Mirrors the route.
void DEFAULT_RELEVANCE_QUERY;
const links = await firecrawl.map(URL_ARG, { limit: 150 });
const ranked = [URL_ARG, ...links.filter((l) => l !== URL_ARG)];
const filter = filterCandidates(ranked, primaryLang);
log("scrape", `Mapped ${ranked.length} URLs, ${filter.kept.length} kept after filter`);

const reranked = await rerankUrls({ rootUrl: URL_ARG, urls: filter.kept.slice(0, 100), llm });
const candidates = pickByScore(reranked, { threshold: 0.4, floor: 8, ceiling: MAX_PAGES });
log("scrape", `Reranked → ${candidates.length} candidates to scrape`);

async function scrapeAll(urls, concurrency) {
  const out = new Array(urls.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      try {
        out[i] = await firecrawl.scrape(urls[i]);
      } catch (e) {
        console.warn(`firecrawl.scrape failed ${urls[i]}: ${e.message}`);
        out[i] = { url: urls[i], markdown: "" };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

const firstPass = (await scrapeAll(candidates, 3)).filter((p) => p.markdown.length > 0);
log("scrape", `Scraped ${firstPass.length}/${candidates.length} with content`);

const seenCanonical = new Set(firstPass.map((p) => canonicalizeUrl(p.url) ?? p.url));
const discovered = extractInternalLinks(firstPass, URL_ARG).filter((u) => !seenCanonical.has(u));
let discoveredPages = [];
if (discovered.length > 0 && firstPass.length < MAX_PAGES) {
  const newFilter = filterCandidates(discovered, primaryLang);
  if (newFilter.kept.length > 0) {
    const newReranked = await rerankUrls({
      rootUrl: URL_ARG,
      urls: newFilter.kept.slice(0, 100),
      llm,
    });
    const newCandidates = pickByScore(newReranked, {
      threshold: 0.4,
      floor: 0,
      ceiling: MAX_PAGES - firstPass.length,
    });
    if (newCandidates.length > 0) {
      const more = await scrapeAll(newCandidates, 3);
      discoveredPages = more.filter((p) => p.markdown.length > 0);
    }
  }
}
const pages = [...firstPass, ...discoveredPages];
log(
  "scrape",
  `Total pages: ${pages.length} (firstPass=${firstPass.length}, discovered=${discoveredPages.length})`,
);

if (pages.length === 0) {
  console.error("No pages scraped — abort");
  process.exit(1);
}

// ── Phase 2: parallel consolidate batches ─────────────────────────────
const batches = [];
for (let i = 0; i < pages.length; i += BATCH_SIZE) batches.push(pages.slice(i, i + BATCH_SIZE));
log(
  "consolidate",
  `Split into ${batches.length} batches (${BATCH_SIZE} pages each, ${PARALLELISM} parallel)`,
);

const partials = new Array(batches.length).fill(null);
const failures = [];
let completed = 0;
let cursor = 0;
const workers = Array.from({ length: Math.min(PARALLELISM, batches.length) }, async () => {
  while (true) {
    const i = cursor++;
    if (i >= batches.length) return;
    const batchStart = performance.now();
    // Mirror production: 270s soft timeout per batch so the test
    // doesn't sit on a stalled 3-flash-preview call forever.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 270_000);
    try {
      const partial = await consolidate({
        rootUrl: URL_ARG,
        pages: batches[i],
        llm,
        signal: ac.signal,
      });
      partials[i] = partial;
      completed++;
      const ms = performance.now() - batchStart;
      log(
        "consolidate",
        `Batch ${completed}/${batches.length} OK · ${(ms / 1000).toFixed(1)}s · ${partial.services.length} svc, ${partial.staff.length} staff, ${partial.faq.length} faq`,
      );
    } catch (e) {
      const ms = performance.now() - batchStart;
      failures.push(`batch ${i + 1}: ${e.message}`);
      log(
        "consolidate",
        `Batch ${i + 1}/${batches.length} FAIL after ${(ms / 1000).toFixed(1)}s — ${e.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
});
await Promise.all(workers);

const valid = partials.filter(Boolean);
log(
  "consolidate",
  `${valid.length}/${batches.length} batches succeeded (${failures.length} failed)`,
);

if (valid.length === 0) {
  console.error("All batches failed — abort");
  console.error(failures.join("\n"));
  process.exit(1);
}

// ── Phase 3: merge + finalize ─────────────────────────────────────────
log("merge", "Merging partials in JS");
const merged = mergePartials(valid);
log(
  "merge",
  `Merged → ${merged.services.length} svc, ${merged.staff.length} staff, ${merged.faq.length} faq`,
);

const md = scraperOutputToMarkdown(merged);
const city = extractPolishCity(merged.tenant.address);
const sysPrompt = buildSystemPrompt({
  tenantDisplayName: merged.tenant.name,
  ...(city ? { city } : {}),
});
const coverage = reportCoverage(merged);
log(
  "finalize",
  `KB markdown ${md.length} chars · sysPrompt ${sysPrompt.length} chars · coverage ${(coverage.score * 100).toFixed(0)}%`,
);

console.log("\n────────────── SUMMARY ──────────────");
console.log(`URL                : ${URL_ARG}`);
console.log(`Total wall time    : ${((performance.now() - t0) / 1000).toFixed(1)}s`);
console.log(`Pages scraped      : ${pages.length}`);
console.log(`Batches            : ${batches.length} (${valid.length} ok, ${failures.length} fail)`);
console.log(`Services           : ${merged.services.length}`);
console.log(
  `Services w/ price  : ${merged.services.filter((s) => s.price?.qualifier && s.price.qualifier !== "unknown").length}`,
);
console.log(`Staff              : ${merged.staff.length}`);
console.log(`FAQ                : ${merged.faq.length}`);
console.log(`Tenant name        : ${merged.tenant.name}`);
console.log(`Coverage score     : ${(coverage.score * 100).toFixed(0)}%`);
console.log(`Coverage warnings  : ${coverage.warnings.length}`);
if (failures.length > 0) {
  console.log(`\nFailures:\n${failures.map((f) => "  " + f).join("\n")}`);
}

import { type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  consolidate,
  createFirecrawlClient,
  scraperOutputToMarkdown,
  filterCandidates,
  rerankUrls,
  pickByScore,
  reportCoverage,
  extractInternalLinks,
  DEFAULT_RELEVANCE_QUERY,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { buildSystemPrompt } from "@ai-receptionist/backend/prompts";
import type { FirecrawlPage } from "@ai-receptionist/backend/scraper";
import { openTestSession, openExistingSession } from "@/lib/test-session-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_CONCURRENCY = 3;
const FIRECRAWL_MAP_LIMIT = 150;
const RERANK_INPUT_CAP = 100;
const SCRAPE_FLOOR = 8;
const SCRAPE_CEILING_MAX = 50;

const BodySchema = z.object({
  url: z.string().url(),
  searchQuery: z.string().min(1).max(500).optional(),
  /** Hard ceiling on pages scraped after LLM re-rank. Cannot be lower than
   *  SCRAPE_FLOOR — the pipeline guarantees a minimum-evidence set.
   *  Increased from 30 -> 35: the heuristic filter no longer drops content,
   *  so the rerank now sees the real candidate pool. Better to scrape a
   *  borderline page than miss the pricing one. */
  maxPages: z
    .number()
    .int()
    .min(SCRAPE_FLOOR)
    .max(SCRAPE_CEILING_MAX)
    .default(35),
  /** URLs scoring below this in re-rank are dropped (unless we'd fall under
   *  the floor of 8). Lowered from 0.5 -> 0.4 because the rerank is now the
   *  ONLY content judge — being permissive here is safer than relying on a
   *  pre-rerank heuristic that we removed. */
  rerankThreshold: z.number().min(0).max(1).default(0.4),
  /** Resume from a previous session's cached scrape — skips
   *  map / filter / rerank / scrape and goes straight to consolidate.
   *  Used when consolidate failed (e.g., Gemini parse error) and the
   *  user wants to retry without re-paying for Firecrawl scrapes. */
  resumeSessionSlug: z.string().min(1).max(200).optional(),
});

/**
 * /api/prepare streams NDJSON progress events to the client so the wizard
 * can show a live log + progress bar. Each line is one JSON event terminated
 * by \n. The final event has type "done" with the full result payload;
 * "error" events terminate the stream.
 *
 * Events emitted (in order on the happy path):
 *   { type: "log", phase, message, percent? }
 *   ...
 *   { type: "done", payload: { knowledgeMarkdown, systemPrompt, ... } }
 *
 * Or on failure:
 *   { type: "error", code, message }
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation_failed", JSON.stringify(parsed.error.flatten()), 400);
  }
  const { url, searchQuery, maxPages, rerankThreshold, resumeSessionSlug } = parsed.data;

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!firecrawlKey) return jsonError("firecrawl_api_key_missing", "Set FIRECRAWL_API_KEY", 500);
  if (!geminiKey) return jsonError("gemini_api_key_missing", "Set GEMINI_API_KEY", 500);

  // If the browser tab closes mid-stream we want to stop running paid
  // Firecrawl/Gemini work. The controller's cancel() fires on disconnect;
  // we use an AbortController so downstream loops can bail between calls.
  // Note: in-flight HTTP calls keep running (firecrawl/gemini clients don't
  // accept a signal yet); but subsequent loop iterations and gemini calls
  // will short-circuit, which eliminates the bulk of the cost leak.
  const abort = new AbortController();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    cancel(reason) {
      abort.abort(reason ?? "client_disconnect");
    },
    async start(controller) {
      let streamClosed = false;
      const emit = (event: Record<string, unknown>) => {
        if (abort.signal.aborted || streamClosed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          streamClosed = true;
        }
      };
      const aborted = () => abort.signal.aborted;

      // If resuming, reopen the existing session; otherwise start a new one.
      const session =
        (resumeSessionSlug ? await openExistingSession(resumeSessionSlug) : null) ??
        (await openTestSession(url).catch(() => null));
      // Surface the session slug to the client immediately so the wizard can
      // offer "Resume from cached scrape" if a later step fails.
      if (session?.slug) {
        emit({ type: "session", slug: session.slug });
      }
      await session?.event("prepare:start", { url, searchQuery, maxPages, resumeSessionSlug });
      emit({
        type: "log",
        phase: "init",
        percent: 2,
        message: resumeSessionSlug
          ? `Resuming from cached scrape (session ${resumeSessionSlug})`
          : `Starting scrape of ${url}`,
      });

      const firecrawl = createFirecrawlClient({ apiKey: firecrawlKey });
      const llm = new LLMClient(createGeminiProvider({ apiKey: geminiKey }), {
        defaultMaxRetries: 1,
      });

      // Shared state populated by either the live-scrape branch or the
      // cache-load branch, then consumed by consolidate + render.
      let validPages: FirecrawlPage[] = [];
      let urlsMapped = 0;
      let droppedCount = 0;

      try {
        if (resumeSessionSlug && session) {
          // RESUME PATH: load cached pages from the session dir on disk and
          // skip directly to consolidate. No Firecrawl, no rerank.
          emit({
            type: "log",
            phase: "resume",
            percent: 10,
            message: `Loading cached pages from session…`,
          });
          const loaded = await loadCachedScrape(session.dir);
          if (loaded.pages.length === 0) {
            emit({
              type: "error",
              code: "resume_no_cache",
              message: `No cached pages found in session ${resumeSessionSlug}. Re-run from scratch instead.`,
            });
            return;
          }
          validPages = loaded.pages;
          urlsMapped = loaded.urlsMapped;
          droppedCount = loaded.droppedCount;
          await session.event("resume:loaded", {
            cachedPages: validPages.length,
          });
          emit({
            type: "log",
            phase: "resume",
            percent: 70,
            message: `Loaded ${validPages.length} cached page${validPages.length === 1 ? "" : "s"}, skipping straight to consolidate`,
          });
        } else {
        // 1. Map.
        emit({ type: "log", phase: "map", percent: 8, message: "Mapping site with Firecrawl (relevance-ranked)…" });
        const links = await firecrawl.map(url, {
          search: searchQuery ?? DEFAULT_RELEVANCE_QUERY,
          limit: FIRECRAWL_MAP_LIMIT,
        });
        if (aborted()) return;
        await session?.event("firecrawl:map", { linksCount: links.length });
        await session?.write("01-firecrawl-map.json", JSON.stringify({ url, links }, null, 2));
        emit({
          type: "log",
          phase: "map",
          percent: 18,
          message: `Firecrawl returned ${links.length} URL${links.length === 1 ? "" : "s"}`,
        });

        // 2. Filter junk + dedupe translations.
        const ranked = [url, ...links.filter((l) => l !== url)];
        urlsMapped = ranked.length;
        const filter = filterCandidates(ranked);
        const afterFilter = filter.kept;
        droppedCount = filter.droppedJunk.length + filter.droppedTranslations.length;
        await session?.event("filter:done", {
          rankedCount: ranked.length,
          keptAfterFilter: afterFilter.length,
          droppedJunkCount: filter.droppedJunk.length,
          droppedTranslationsCount: filter.droppedTranslations.length,
          detectedLanguagePrefixes: filter.detectedLanguagePrefixes,
        });
        await session?.write(
          "02-url-filter.json",
          JSON.stringify(
            {
              ranked,
              droppedJunk: filter.droppedJunk,
              droppedTranslations: filter.droppedTranslations,
              detectedLanguagePrefixes: filter.detectedLanguagePrefixes,
              keptForRerank: afterFilter,
            },
            null,
            2,
          ),
        );
        const langPart =
          filter.droppedTranslations.length > 0
            ? `, ${filter.droppedTranslations.length} non-Polish translation${filter.droppedTranslations.length === 1 ? "" : "s"} (${filter.detectedLanguagePrefixes.filter((p) => p !== "pl").join(", ") || "—"})`
            : "";
        emit({
          type: "log",
          phase: "filter",
          percent: 20,
          message: `Filter dropped ${filter.droppedJunk.length} junk${langPart}; ${afterFilter.length} URL${afterFilter.length === 1 ? "" : "s"} survive`,
        });

        // 2b. LLM re-rank with Gemini Flash Lite (~1s, ~$0.0005).
        // Scores each URL 0-1 from path text alone, then pickByScore takes
        // everything >=threshold with a floor of 8 and ceiling of maxPages.
        const toRerank = afterFilter.slice(0, RERANK_INPUT_CAP);
        emit({
          type: "log",
          phase: "rerank",
          percent: 22,
          message: `Re-ranking top ${toRerank.length} URL${toRerank.length === 1 ? "" : "s"} with Gemini Flash Lite…`,
        });
        const rerankStart = Date.now();
        const reranked = await rerankUrls({ rootUrl: url, urls: toRerank, llm });
        const rerankMs = Date.now() - rerankStart;
        if (aborted()) return;
        const candidates = pickByScore(reranked, {
          threshold: rerankThreshold,
          floor: SCRAPE_FLOOR,
          ceiling: maxPages,
        });
        await session?.event("rerank:done", {
          inputCount: toRerank.length,
          rerankMs,
          threshold: rerankThreshold,
          floor: SCRAPE_FLOOR,
          ceiling: maxPages,
          pickedCount: candidates.length,
          topScore: reranked[0]?.score ?? null,
          bottomScore: reranked[reranked.length - 1]?.score ?? null,
        });
        await session?.write(
          "03-rerank.json",
          JSON.stringify(
            {
              rerankMs,
              threshold: rerankThreshold,
              floor: SCRAPE_FLOOR,
              ceiling: maxPages,
              ranked: reranked,
              picked: candidates,
            },
            null,
            2,
          ),
        );
        const aboveT = reranked.filter((r) => r.score >= rerankThreshold).length;
        emit({
          type: "log",
          phase: "rerank",
          percent: 25,
          message: `Rerank picked ${candidates.length} URL${candidates.length === 1 ? "" : "s"} (${aboveT} scored ≥${rerankThreshold.toFixed(2)}, top ${reranked[0]?.score.toFixed(2) ?? "—"})`,
        });

        // 3. Scrape with progress per page.
        emit({
          type: "log",
          phase: "scrape",
          percent: 28,
          message: `Scraping ${candidates.length} page${candidates.length === 1 ? "" : "s"} (concurrency ${DEFAULT_CONCURRENCY})…`,
        });
        const pages = await scrapeWithProgress(
          firecrawl,
          candidates,
          DEFAULT_CONCURRENCY,
          (done, total, lastUrl) => {
            const pct = 28 + Math.round((done / total) * 42);
            emit({
              type: "log",
              phase: "scrape",
              percent: pct,
              message: `Scraped ${done}/${total} · ${shorten(lastUrl)}`,
            });
          },
          abort.signal,
        );
        if (aborted()) return;
        validPages = pages.filter((p) => p.markdown.length > 0);
        await session?.event("firecrawl:scrape", { pagesCount: validPages.length });
        await session?.write(
          "04-firecrawl-pages.json",
          JSON.stringify(
            validPages.map((p) => ({ url: p.url, markdownLength: p.markdown.length })),
            null,
            2,
          ),
        );
        for (let i = 0; i < validPages.length; i++) {
          const p = validPages[i]!;
          const safe = p.url.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 100);
          await session?.write(`pages/${String(i + 1).padStart(2, "0")}-${safe}.md`, p.markdown);
        }
        if (validPages.length === 0) {
          emit({
            type: "error",
            code: "no_content_scraped",
            message: "Firecrawl returned 0 pages with markdown — site might block scrapers or have no content",
          });
          controller.close();
          return;
        }
        emit({
          type: "log",
          phase: "scrape",
          percent: 65,
          message: `First-pass scrape complete: ${validPages.length} page${validPages.length === 1 ? "" : "s"} with content`,
        });

        // 3b. Discovery iteration — parse internal links out of the
        // scraped markdown to catch URLs Firecrawl's /map missed
        // (e.g. /cennik when not in the sitemap). One pass only to
        // avoid infinite crawl. Universal — no canonical path probes.
        const seenUrls = new Set(validPages.map((p) => p.url));
        const discovered = extractInternalLinks(validPages, url);
        const newLinks = discovered.filter((u) => !seenUrls.has(u));
        if (newLinks.length > 0 && !aborted()) {
          const newFilter = filterCandidates(newLinks);
          const newKept = newFilter.kept;
          await session?.event("discover:done", {
            extractedFromPages: validPages.length,
            discoveredCount: discovered.length,
            newCount: newLinks.length,
            keptAfterFilter: newKept.length,
          });
          await session?.write(
            "04a-discovered.json",
            JSON.stringify(
              {
                discovered,
                newAndUnseen: newLinks,
                keptAfterFilter: newKept,
                droppedJunk: newFilter.droppedJunk,
                droppedTranslations: newFilter.droppedTranslations,
              },
              null,
              2,
            ),
          );
          if (newKept.length > 0) {
            emit({
              type: "log",
              phase: "discover",
              percent: 67,
              message: `Discovered ${newKept.length} new URL${newKept.length === 1 ? "" : "s"} from scraped pages — running second rerank`,
            });
            const remainingBudget = Math.max(0, maxPages - validPages.length);
            if (remainingBudget > 0) {
              const newReranked = await rerankUrls({
                rootUrl: url,
                urls: newKept.slice(0, RERANK_INPUT_CAP),
                llm,
              });
              if (aborted()) return;
              const newPicked = pickByScore(newReranked, {
                threshold: rerankThreshold,
                floor: Math.min(remainingBudget, 3),
                ceiling: remainingBudget,
              });
              await session?.write(
                "04b-discover-rerank.json",
                JSON.stringify(
                  { ranked: newReranked, picked: newPicked, budget: remainingBudget },
                  null,
                  2,
                ),
              );
              if (newPicked.length > 0) {
                emit({
                  type: "log",
                  phase: "discover",
                  percent: 68,
                  message: `Second-pass scrape: ${newPicked.length} URL${newPicked.length === 1 ? "" : "s"} (budget ${remainingBudget})`,
                });
                const morePages = await scrapeWithProgress(
                  firecrawl,
                  newPicked,
                  DEFAULT_CONCURRENCY,
                  (done, total, lastUrl) => {
                    emit({
                      type: "log",
                      phase: "discover",
                      percent: 68 + Math.round((done / total) * 4),
                      message: `Discover-scrape ${done}/${total} · ${shorten(lastUrl)}`,
                    });
                  },
                  abort.signal,
                );
                if (aborted()) return;
                const moreValid = morePages.filter((p) => p.markdown.length > 0);
                for (let i = 0; i < moreValid.length; i++) {
                  const p = moreValid[i]!;
                  const safe = p.url.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 100);
                  await session?.write(
                    `pages/discover-${String(i + 1).padStart(2, "0")}-${safe}.md`,
                    p.markdown,
                  );
                }
                validPages = [...validPages, ...moreValid];
                emit({
                  type: "log",
                  phase: "discover",
                  percent: 72,
                  message: `Discovery added ${moreValid.length} more page${moreValid.length === 1 ? "" : "s"} — total ${validPages.length}`,
                });
              }
            }
          }
        }
        } // end else (live-scrape branch)

        // Both resume + live-scrape converge here.

        // 4. Consolidate.
        emit({
          type: "log",
          phase: "consolidate",
          percent: 78,
          message: "Consolidating with Gemini 3 Flash…",
        });
        if (aborted()) return;
        const scraperOutput = await consolidate({ rootUrl: url, pages: validPages, llm });
        if (aborted()) return;
        await session?.event("gemini:consolidate", {
          tenantName: scraperOutput.tenant.name,
          services: scraperOutput.services.length,
          staff: scraperOutput.staff.length,
          faq: scraperOutput.faq.length,
          hasUnknownPrices: scraperOutput.hasUnknownPrices,
        });
        await session?.write(
          "05-gemini-consolidated.json",
          JSON.stringify(scraperOutput, null, 2),
        );
        emit({
          type: "log",
          phase: "consolidate",
          percent: 92,
          message: `Gemini extracted: ${scraperOutput.services.length} services · ${scraperOutput.staff.length} staff · ${scraperOutput.faq.length} FAQ`,
        });

        // 4b. Coverage validation — deterministic check on the consolidated
        // output. Surfaces structured warnings so the wizard can show a
        // banner when critical fields (phone, prices, hours) are missing.
        const coverage = reportCoverage(scraperOutput);
        await session?.event("coverage:report", {
          score: coverage.score,
          warningCount: coverage.warnings.length,
          warnings: coverage.warnings.map((w) => ({ code: w.code, severity: w.severity })),
          details: coverage.details,
        });
        await session?.write(
          "05a-coverage.json",
          JSON.stringify(coverage, null, 2),
        );
        if (coverage.warnings.length > 0) {
          const critical = coverage.warnings.filter((w) => w.severity === "critical").length;
          const high = coverage.warnings.filter((w) => w.severity === "high").length;
          emit({
            type: "log",
            phase: "coverage",
            percent: 94,
            message: `Coverage score ${Math.round(coverage.score * 100)}% — ${critical} critical, ${high} high, ${coverage.warnings.length} total warning${coverage.warnings.length === 1 ? "" : "s"}`,
          });
        } else {
          emit({
            type: "log",
            phase: "coverage",
            percent: 94,
            message: `Coverage 100% — phone, address, hours, services-with-prices all captured`,
          });
        }

        // 5. Render artifacts.
        const knowledgeMarkdown = scraperOutputToMarkdown(scraperOutput);
        const systemPrompt = buildSystemPrompt({
          tenantDisplayName: scraperOutput.tenant.name,
        });
        await session?.write("06-knowledge.md", knowledgeMarkdown);
        await session?.write("07-system-prompt.md", systemPrompt);
        await session?.event("prepare:done", {
          tenantName: scraperOutput.tenant.name,
          knowledgeMarkdownLength: knowledgeMarkdown.length,
          systemPromptLength: systemPrompt.length,
          sessionDir: session?.dir,
        });
        emit({
          type: "log",
          phase: "render",
          percent: 100,
          message: `Ready — review the brief below`,
        });

        emit({
          type: "done",
          payload: {
            suggestedTenantName: scraperOutput.tenant.name,
            knowledgeMarkdown,
            systemPrompt,
            sessionSlug: session?.slug,
            scraperSummary: {
              sourceUrl: scraperOutput.sourceUrl,
              scrapedAt: scraperOutput.scrapedAt,
              urlsMapped,
              urlsDroppedByFilter: droppedCount,
              pagesScraped: validPages.length,
              servicesCount: scraperOutput.services.length,
              staffCount: scraperOutput.staff.length,
              faqCount: scraperOutput.faq.length,
              hasUnknownPrices: scraperOutput.hasUnknownPrices,
            },
            coverage,
          },
        });
      } catch (e) {
        if (aborted()) {
          await session?.event("prepare:aborted", { reason: "client_disconnect" });
        } else {
          const msg = (e as Error).message;
          await session?.event("prepare:error", { code: "unexpected", message: msg });
          emit({ type: "error", code: "unexpected", message: msg });
        }
      } finally {
        if (!streamClosed) {
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // cancel() may have already closed the controller
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ type: "error", code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function shorten(u: string): string {
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.length > 30 ? parsed.pathname.slice(0, 30) + "…" : parsed.pathname;
    return parsed.host + path;
  } catch {
    return u.length > 50 ? u.slice(0, 50) + "…" : u;
  }
}

/**
 * Reload a previous scrape's pages from the on-disk session artifact so
 * /api/prepare can skip Firecrawl entirely when consolidate fails mid-
 * pipeline. Reads 04-firecrawl-pages.json (URL + length manifest) plus
 * pages/<idx>-<slug>.md for each entry. Returns the same FirecrawlPage
 * shape the live scrape produces.
 *
 * Future: when we add UI-driven client-supplied knowledge appending,
 * the consolidator should semantically merge that input into the scrape
 * result (de-dupe near-identical service rows, never overwrite scraped
 * content with stale manual entries). Out of scope for this commit.
 */
async function loadCachedScrape(
  sessionDir: string,
): Promise<{ pages: FirecrawlPage[]; urlsMapped: number; droppedCount: number }> {
  let manifest: Array<{ url: string; markdownLength: number }> = [];
  try {
    const raw = await fs.readFile(
      path.join(sessionDir, "04-firecrawl-pages.json"),
      "utf-8",
    );
    manifest = JSON.parse(raw);
  } catch {
    return { pages: [], urlsMapped: 0, droppedCount: 0 };
  }

  const pagesDir = path.join(sessionDir, "pages");
  let files: string[] = [];
  try {
    files = (await fs.readdir(pagesDir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { pages: [], urlsMapped: 0, droppedCount: 0 };
  }

  const pages: FirecrawlPage[] = [];
  for (let i = 0; i < files.length && i < manifest.length; i++) {
    const fileName = files[i]!;
    const entry = manifest[i]!;
    try {
      const md = await fs.readFile(path.join(pagesDir, fileName), "utf-8");
      pages.push({ url: entry.url, markdown: md });
    } catch {
      // skip unreadable file
    }
  }

  // We don't bother recovering original urlsMapped/droppedCount counts;
  // they're cosmetic in the resume path. The scraperSummary in the UI
  // will just show 0 for these and the actual pagesScraped count.
  return { pages, urlsMapped: 0, droppedCount: 0 };
}

async function scrapeWithProgress(
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  urls: string[],
  concurrency: number,
  onProgress: (done: number, total: number, lastUrl: string) => void,
  signal?: AbortSignal,
): Promise<FirecrawlPage[]> {
  const out: FirecrawlPage[] = new Array(urls.length);
  let index = 0;
  let done = 0;
  const total = urls.length;
  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    async () => {
      while (true) {
        if (signal?.aborted) return;
        const i = index++;
        if (i >= urls.length) return;
        const u = urls[i]!;
        try {
          out[i] = await firecrawl.scrape(u);
        } catch (e) {
          console.warn("firecrawl.scrape failed", u, (e as Error).message);
          out[i] = { url: u, markdown: "" };
        }
        done++;
        onProgress(done, total, u);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

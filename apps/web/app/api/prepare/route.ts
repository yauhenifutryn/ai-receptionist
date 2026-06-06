import { type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  canonicalizeUrl,
  consolidate,
  createFirecrawlClient,
  scraperOutputToMarkdown,
  detectPrimaryLanguage,
  filterCandidates,
  rerankUrls,
  pickByScore,
  reportCoverage,
  extractInternalLinks,
  MIN_PAGE_CHARS,
  PER_PAGE_CHAR_CAP,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import {
  buildSystemPrompt,
  clinicFactsFromScraperTenant,
  extractPolishCity,
} from "@ai-receptionist/backend/prompts";
import type { FirecrawlPage } from "@ai-receptionist/backend/scraper";
import { openTestSession, openExistingSession } from "@/lib/test-session-logger";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Firecrawl scrape of up to 35 pages at concurrency 2 plus Gemini consolidate
// regularly takes 60–180s for larger clinic sites. Vercel's current default
// function ceiling is 300s; setting it explicitly avoids the "Stream ended
// without a result" timeout on slow sites. If Hobby tier enforces a lower
// hard cap, we fall back to client-driven batching (map → scrape-batch →
// consolidate as separate fast calls). See git log for the batched design.
export const maxDuration = 300;

// 2026-06-06: the Firecrawl plan allows maxConcurrency=2 (verified via
// /v2/concurrency-check). Running 3 queues the third request server-side
// and the queue wait burns the 45s scrape timeout → 408 SCRAPE_TIMEOUT.
const DEFAULT_CONCURRENCY = 2;
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
  maxPages: z.number().int().min(SCRAPE_FLOOR).max(SCRAPE_CEILING_MAX).default(35),
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
  // operator gate. /api/prepare runs paid Firecrawl + Gemini work (60-180s
  // per call, up to 50 pages scraped) and is internal-only. Without this gate
  // anyone with the URL can drain our LLM quota and tie up function concurrency.
  // Mirrors the gate on /api/provision (the next step in the same flow).
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return jsonError(operator.body.error, operator.body.error, operator.status);
  }

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
          emit({
            type: "log",
            phase: "map",
            percent: 8,
            message: "Mapping site with Firecrawl…",
          });
          // No `search`: it collapses bot-protected WP sites to 1 URL.
          // Relevance handled downstream by filterCandidates + rerankUrls.
          void searchQuery;
          const links = await firecrawl.map(url, {
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

          // 1b. Detect the site's primary content language from its root
          //     redirect. EN-primary dental-tourism sites (e.g. indexmedica.com)
          //     used to lose their best pages to the hardcoded PL dedupe;
          //     now they keep them. Falls back to "pl" if no clear redirect
          //     signal — preserves prior behavior for plain .pl clinics.
          const detectedPrimary = await detectPrimaryLanguage(url);
          const primaryLang = detectedPrimary ?? "pl";
          await session?.event("lang:detected", { detectedPrimary, primaryLang });
          emit({
            type: "log",
            phase: "filter",
            percent: 19,
            message: detectedPrimary
              ? `Detected site primary language from root redirect: ${detectedPrimary}`
              : `No language redirect at root — using default primary: pl`,
          });

          // 2. Filter junk + dedupe translations.
          const ranked = [url, ...links.filter((l) => l !== url)];
          urlsMapped = ranked.length;
          const filter = filterCandidates(ranked, primaryLang);
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
          const reranked = await rerankUrls({
            rootUrl: url,
            urls: toRerank,
            llm,
            signal: abort.signal,
          });
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
          // MIN_PAGE_CHARS (not >0): Firecrawl can return HTTP 200 whose
          // markdown is an infra error stub ("Invalid upstream proxy
          // credentials") — never count those as content.
          validPages = pages.filter((p) => p.markdown.length >= MIN_PAGE_CHARS);
          await session?.event("firecrawl:scrape", { pagesCount: validPages.length });
          // Manifest entries include the per-page filename so the resume path
          // can pair URL→markdown explicitly, instead of relying on filesystem
          // sort order matching the write order (breaks at 100+ pages and
          // when sibling discover-* files are also present).
          const manifest = validPages.map((p, i) => {
            const safe = p.url.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 100);
            const file = `${String(i + 1).padStart(2, "0")}-${safe}.md`;
            return { url: p.url, markdownLength: p.markdown.length, file };
          });
          await session?.write("04-firecrawl-pages.json", JSON.stringify(manifest, null, 2));
          await Promise.all(
            validPages.map((p, i) => session?.write(`pages/${manifest[i]!.file}`, p.markdown)),
          );
          if (validPages.length === 0) {
            emit({
              type: "error",
              code: "no_content_scraped",
              message:
                "Firecrawl returned 0 pages with markdown — site might block scrapers or have no content",
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
          //
          // Compare via canonicalizeUrl so www/non-www and trailing-
          // slash variants of the same logical page don't get scraped
          // twice. extractInternalLinks already emits canonical URLs;
          // validPages[i].url comes from Firecrawl's sourceURL metadata
          // which may include a www prefix the user's input didn't.
          const seenCanonical = new Set(validPages.map((p) => canonicalizeUrl(p.url) ?? p.url));
          const discovered = extractInternalLinks(validPages, url);
          const newLinks = discovered.filter((u) => !seenCanonical.has(u));
          if (newLinks.length > 0 && !aborted()) {
            const newFilter = filterCandidates(newLinks, primaryLang);
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
                  signal: abort.signal,
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
                  const moreValid = morePages.filter((p) => p.markdown.length >= MIN_PAGE_CHARS);
                  await Promise.all(
                    moreValid.map((p, i) => {
                      const safe = p.url.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 100);
                      return session?.write(
                        `pages/discover-${String(i + 1).padStart(2, "0")}-${safe}.md`,
                        p.markdown,
                      );
                    }),
                  );
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
        // Show the user what's about to be sent to Gemini: page count + the
        // actual char count after per-page capping. Tokens are estimated at
        // ~4 chars/token (Gemini tokenizer is close enough for status text).
        const inputChars = validPages.reduce(
          (sum, p) => sum + Math.min(p.markdown.length, PER_PAGE_CHAR_CAP),
          0,
        );
        const inputWords = validPages.reduce(
          (sum, p) =>
            sum + p.markdown.slice(0, PER_PAGE_CHAR_CAP).split(/\s+/).filter(Boolean).length,
          0,
        );
        const inputTokens = Math.round(inputChars / 4);
        emit({
          type: "log",
          phase: "consolidate",
          percent: 78,
          message: `Consolidating ${validPages.length} page${validPages.length === 1 ? "" : "s"} with Gemini 3 Flash · ${inputChars.toLocaleString("en-US")} chars · ${inputWords.toLocaleString("en-US")} words · ~${inputTokens.toLocaleString("en-US")} tokens (4-9 min for full quality)`,
        });
        if (aborted()) return;
        // Heartbeat so the wizard log doesn't look frozen during the long
        // single Gemini call. Emits "Still consolidating… Ns elapsed" every
        // 15s. Stops on resolve, throw, or abort via try/finally.
        const consolidateStart = Date.now();
        const heartbeat = setInterval(() => {
          if (abort.signal.aborted) return;
          const elapsed = Math.round((Date.now() - consolidateStart) / 1000);
          emit({
            type: "log",
            phase: "consolidate",
            percent: 78,
            message: `Still consolidating… ${elapsed}s elapsed — Gemini is processing ${inputChars.toLocaleString("en-US")} chars`,
          });
        }, 15000);
        let scraperOutput;
        try {
          scraperOutput = await consolidate({
            rootUrl: url,
            pages: validPages,
            llm,
            signal: abort.signal,
          });
        } finally {
          clearInterval(heartbeat);
        }
        if (aborted()) return;
        const consolidateMs = Date.now() - consolidateStart;
        emit({
          type: "log",
          phase: "consolidate",
          percent: 90,
          message: `Consolidate done in ${(consolidateMs / 1000).toFixed(1)}s`,
        });
        await session?.event("gemini:consolidate", {
          tenantName: scraperOutput.tenant.name,
          services: scraperOutput.services.length,
          staff: scraperOutput.staff.length,
          faq: scraperOutput.faq.length,
          hasUnknownPrices: scraperOutput.hasUnknownPrices,
        });
        await session?.write("05-gemini-consolidated.json", JSON.stringify(scraperOutput, null, 2));
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
        await session?.write("05a-coverage.json", JSON.stringify(coverage, null, 2));
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
        const detectedCity = extractPolishCity(scraperOutput.tenant.address);
        const systemPrompt = buildSystemPrompt({
          tenantDisplayName: scraperOutput.tenant.name,
          ...(detectedCity ? { city: detectedCity } : {}),
          clinicFacts: clinicFactsFromScraperTenant(scraperOutput.tenant),
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
  let manifest: Array<{ url: string; markdownLength: number; file?: string }> = [];
  try {
    const raw = await fs.readFile(path.join(sessionDir, "04-firecrawl-pages.json"), "utf-8");
    manifest = JSON.parse(raw);
  } catch {
    return { pages: [], urlsMapped: 0, droppedCount: 0 };
  }

  const pagesDir = path.join(sessionDir, "pages");
  let availableFiles: Set<string>;
  try {
    availableFiles = new Set((await fs.readdir(pagesDir)).filter((f) => f.endsWith(".md")));
  } catch {
    return { pages: [], urlsMapped: 0, droppedCount: 0 };
  }

  // Pair URL → markdown explicitly via the per-entry filename in the manifest.
  // Falls back to positional pairing for legacy sessions written before the
  // manifest carried `file` (works at <100 pages where lexicographic sort
  // matches the zero-padded write order).
  const sortedLegacy = [...availableFiles].sort();
  const pages: FirecrawlPage[] = [];
  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i]!;
    const fileName = entry.file ?? sortedLegacy[i];
    if (!fileName || !availableFiles.has(fileName)) continue;
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
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
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
  });
  await Promise.all(workers);
  return out;
}

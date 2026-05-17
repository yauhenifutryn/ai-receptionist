import { type NextRequest } from "next/server";
import { z } from "zod";
import {
  consolidate,
  createFirecrawlClient,
  scraperOutputToMarkdown,
  filterCandidates,
  rerankUrls,
  pickByScore,
  DEFAULT_RELEVANCE_QUERY,
} from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { buildSystemPrompt } from "@ai-receptionist/backend/prompts";
import type { FirecrawlPage } from "@ai-receptionist/backend/scraper";
import { openTestSession } from "@/lib/test-session-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  url: z.string().url(),
  searchQuery: z.string().min(1).max(500).optional(),
  /** Hard ceiling on pages scraped after LLM re-rank. Dynamic floor is 8. */
  maxPages: z.number().int().positive().max(40).default(30),
  /** URLs scoring below this in re-rank are dropped (unless we'd fall under
   *  the floor of 8). Tunable per call for noisier sites. */
  rerankThreshold: z.number().min(0).max(1).default(0.5),
});

const DEFAULT_CONCURRENCY = 3;
const RERANK_INPUT_CAP = 60;
const SCRAPE_FLOOR = 8;

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
  const { url, searchQuery, maxPages, rerankThreshold } = parsed.data;

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!firecrawlKey) return jsonError("firecrawl_api_key_missing", "Set FIRECRAWL_API_KEY", 500);
  if (!geminiKey) return jsonError("gemini_api_key_missing", "Set GEMINI_API_KEY", 500);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      const session = await openTestSession(url).catch(() => null);
      await session?.event("prepare:start", { url, searchQuery, maxPages });
      emit({ type: "log", phase: "init", percent: 2, message: `Starting scrape of ${url}` });

      const firecrawl = createFirecrawlClient({ apiKey: firecrawlKey });
      const llm = new LLMClient(createGeminiProvider({ apiKey: geminiKey }), {
        defaultMaxRetries: 1,
      });

      try {
        // 1. Map.
        emit({ type: "log", phase: "map", percent: 8, message: "Mapping site with Firecrawl (relevance-ranked)…" });
        const links = await firecrawl.map(url, {
          search: searchQuery ?? DEFAULT_RELEVANCE_QUERY,
          limit: 100,
        });
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
        const filter = filterCandidates(ranked);
        const afterFilter = filter.kept;
        const droppedCount = filter.droppedJunk.length + filter.droppedTranslations.length;
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
        );
        const validPages = pages.filter((p) => p.markdown.length > 0);
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
          percent: 72,
          message: `Scrape complete: ${validPages.length} page${validPages.length === 1 ? "" : "s"} with content`,
        });

        // 4. Consolidate.
        emit({
          type: "log",
          phase: "consolidate",
          percent: 78,
          message: "Consolidating with Gemini 3.1 Pro Preview (this is the slowest step)…",
        });
        const scraperOutput = await consolidate({ rootUrl: url, pages: validPages, llm });
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
              urlsMapped: ranked.length,
              urlsDroppedByFilter: droppedCount,
              pagesScraped: validPages.length,
              servicesCount: scraperOutput.services.length,
              staffCount: scraperOutput.staff.length,
              faqCount: scraperOutput.faq.length,
              hasUnknownPrices: scraperOutput.hasUnknownPrices,
            },
          },
        });
      } catch (e) {
        const msg = (e as Error).message;
        await session?.event("prepare:error", { code: "unexpected", message: msg });
        emit({ type: "error", code: "unexpected", message: msg });
      } finally {
        controller.close();
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

async function scrapeWithProgress(
  firecrawl: ReturnType<typeof createFirecrawlClient>,
  urls: string[],
  concurrency: number,
  onProgress: (done: number, total: number, lastUrl: string) => void,
): Promise<FirecrawlPage[]> {
  const out: FirecrawlPage[] = new Array(urls.length);
  let index = 0;
  let done = 0;
  const total = urls.length;
  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    async () => {
      while (true) {
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

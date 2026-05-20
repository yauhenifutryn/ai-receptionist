import { z } from "zod";
import type { LLMClient } from "../lib/llm.js";

/**
 * LLM re-ranker — third cheap signal on top of Firecrawl's relevance
 * map + our heuristic junk/translation filter. Asks Gemini Flash Lite
 * to score each surviving URL 0-1 for likelihood of containing
 * receptionist-relevant info (services, prices, hours, staff, FAQ,
 * contact, booking).
 *
 * Why a separate cheap LLM call: Firecrawl's `map` `search` param ranks
 * URLs by general relevance but doesn't know our exact use case
 * (booking-flow KB). The heuristic filter catches obvious junk but
 * can't distinguish "/o-nas" (about — useful) from "/inwestycje"
 * (investor relations — useless) when neither matches the blocklist.
 *
 * Flash Lite is the right model: ~$0.075 in / $0.30 out per 1M tokens
 * means a 50-URL rerank costs ~$0.0005. Latency ~1-2s. Negligible.
 *
 * Output is sorted desc by score so callers can take a threshold or
 * a top-N slice. `pickByScore` does the dynamic cap.
 */

const ScoreItemSchema = z.object({
  url: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string().max(300),
});

const RerankResponseSchema = z.object({
  ranked: z.array(ScoreItemSchema),
});

/**
 * Gemini-side JSON Schema (OpenAPI 3.0 subset) for gen-time constraint.
 * Mirrors RerankResponseSchema so the model can't return shapes that
 * fail Zod post-validation. Without this, an oversized `reason` killed
 * the rerank earlier in this branch's history.
 */
const RERANK_RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    ranked: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          url: { type: "STRING" },
          score: { type: "NUMBER" },
          reason: { type: "STRING" },
        },
        required: ["url", "score", "reason"],
      },
    },
  },
  required: ["ranked"],
} as const;

export type RerankItem = z.infer<typeof ScoreItemSchema>;

export interface RerankArgs {
  rootUrl: string;
  urls: string[];
  llm: LLMClient;
  /** Optional override of the use-case description so non-clinic verticals
   *  (vet, salon, gym) can be reranked correctly without changing this file. */
  useCaseDescription?: string;
  /** Cancel the in-flight rerank when the client disconnects or hits Cancel. */
  signal?: AbortSignal;
}

const DEFAULT_USE_CASE =
  "We are building a voice-receptionist agent that handles inbound phone calls for the business. " +
  "We need pages that contain: services offered, prices, opening hours, staff names + roles, " +
  "contact info, location/address, FAQ, booking process, NFZ/insurance coverage. " +
  "We do NOT want: blog posts, news, press releases, investor pages, careers, legal text, " +
  "marketing landing pages with no concrete info, navigation pages, archives.";

const SYSTEM_PROMPT =
  "You are the SOLE content judge for which URLs get scraped from a business website. " +
  "There is no other filter — if you mark a URL low, it will not be scraped and its " +
  "content will be missing from the agent's knowledge base. Be INCLUSIVE: when in doubt, score higher. " +
  "Better to scrape a borderline page than to miss the pricing page hiding behind an unusual slug. " +
  "\n\n" +
  "Score each URL 0.0 to 1.0 from the URL path text alone (you cannot see page content). " +
  "Scoring rubric: " +
  "0.9-1.0 = obvious must-have (e.g. /cennik, /uslugi, /service-category/implanty, /kontakt, /godziny, /faq, /doctors/X, /zespol, /o-nas). " +
  "0.6-0.8 = likely useful detail page (e.g. /implant-leczenie, /najlepsze-opcje-X, /pilna-pomoc, sub-pages of services). " +
  "0.4-0.6 = uncertain — could contain pricing or service info, lean toward scraping (e.g. /promocje, /pakiety, /before-after, generic article slugs). " +
  "0.2-0.4 = probably not useful but possible to contain stray contact / hours info (e.g. /blog/clinic-news, /press-release). " +
  "0.0-0.2 = clearly noise (e.g. /authors/jan-kowalski, /tag/promo, /404). " +
  "\n\n" +
  "Return ONE entry per input URL, preserving the URL string exactly. " +
  "Keep each 'reason' to a brief phrase under 80 characters. " +
  "Output JSON only matching: {\"ranked\": [{\"url\": string, \"score\": number, \"reason\": string}, ...]}.";

function buildUserPrompt(args: RerankArgs): string {
  const useCase = args.useCaseDescription ?? DEFAULT_USE_CASE;
  return [
    `Business root URL: ${args.rootUrl}`,
    "",
    "Use case:",
    useCase,
    "",
    `Score these ${args.urls.length} URLs:`,
    ...args.urls.map((u, i) => `${i + 1}. ${u}`),
  ].join("\n");
}

/**
 * Score every URL with Flash Lite and return them sorted desc by score.
 * Preserves all input URLs (Zod schema is permissive on count). If the
 * LLM omits a URL, it's appended at score 0.5 (neutral) so it isn't
 * silently lost.
 */
export async function rerankUrls(args: RerankArgs): Promise<RerankItem[]> {
  if (args.urls.length === 0) return [];

  const result = await args.llm.generateStructured({
    model: "gemini-3.1-flash-lite",
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(args),
    schema: RerankResponseSchema,
    jsonSchema: RERANK_RESPONSE_JSON_SCHEMA,
    temperature: 0,
    maxOutputTokens: 8192,
    ...(args.signal !== undefined ? { abortSignal: args.signal } : {}),
  });

  const byUrl = new Map<string, RerankItem>();
  for (const item of result.data.ranked) byUrl.set(item.url, item);

  const out: RerankItem[] = [];
  for (const u of args.urls) {
    const scored = byUrl.get(u);
    if (scored) out.push(scored);
    // Omitted URLs get score 0.0 (below any reasonable threshold) so
    // junk the model implicitly rejected can't sneak past pickByScore.
    // pickByScore's floor will still backfill these if no scored URLs
    // qualify — but they will never outrank legitimately-scored URLs.
    else out.push({ url: u, score: 0, reason: "model omitted this URL — defaulted below threshold" });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export interface PickByScoreOptions {
  /** URLs below this score are dropped (unless we'd fall under `floor`). */
  threshold?: number;
  /** Always keep at least this many even if all are below threshold. */
  floor?: number;
  /** Never scrape more than this, even if all are above threshold. */
  ceiling?: number;
}

/**
 * Pick a dynamic subset of ranked URLs to actually scrape:
 *   1. Keep everything at or above `threshold`.
 *   2. If that's fewer than `floor`, top up to `floor` from the rest.
 *   3. Never exceed `ceiling`.
 *
 * Result is the URL strings only, preserving rank order.
 */
export function pickByScore(
  ranked: RerankItem[],
  opts: PickByScoreOptions = {},
): string[] {
  const threshold = opts.threshold ?? 0.5;
  const floor = opts.floor ?? 8;
  const ceiling = opts.ceiling ?? 30;
  const aboveThreshold = ranked.filter((r) => r.score >= threshold);
  let picked: RerankItem[];
  if (aboveThreshold.length >= floor) {
    picked = aboveThreshold;
  } else {
    picked = ranked.slice(0, Math.min(floor, ranked.length));
  }
  picked = picked.slice(0, ceiling);
  return picked.map((p) => p.url);
}

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

export type RerankItem = z.infer<typeof ScoreItemSchema>;

export interface RerankArgs {
  rootUrl: string;
  urls: string[];
  llm: LLMClient;
  /** Optional override of the use-case description so non-clinic verticals
   *  (vet, salon, gym) can be reranked correctly without changing this file. */
  useCaseDescription?: string;
}

const DEFAULT_USE_CASE =
  "We are building a voice-receptionist agent that handles inbound phone calls for the business. " +
  "We need pages that contain: services offered, prices, opening hours, staff names + roles, " +
  "contact info, location/address, FAQ, booking process, NFZ/insurance coverage. " +
  "We do NOT want: blog posts, news, press releases, investor pages, careers, legal text, " +
  "marketing landing pages with no concrete info, navigation pages, archives.";

const SYSTEM_PROMPT =
  "You are a URL classifier. For each URL you are given, score it from 0.0 to 1.0 based on " +
  "how likely it is to contain information useful to a voice-receptionist agent. " +
  "Use ONLY the URL path text to decide — you cannot see page content. " +
  "Higher score = more likely useful. Score 1.0 means certain (e.g. /cennik, /uslugi/implanty, /kontakt). " +
  "Score 0.0 means certain garbage (e.g. /blog/post-2019, /inwestorzy). " +
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
    temperature: 0,
    maxOutputTokens: 8192,
  });

  const byUrl = new Map<string, RerankItem>();
  for (const item of result.data.ranked) byUrl.set(item.url, item);

  const out: RerankItem[] = [];
  for (const u of args.urls) {
    const scored = byUrl.get(u);
    if (scored) out.push(scored);
    else out.push({ url: u, score: 0.5, reason: "no score from model — neutral default" });
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

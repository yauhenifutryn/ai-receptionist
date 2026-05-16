import {
  ScraperOutputSchema,
  type ScraperOutput,
} from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import type { FirecrawlPage } from "./firecrawl.js";

export const CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES =
  "Hard rule: never invent prices. If a price is not in the source markdown, set price.amount to the literal string \"unknown\". Do not infer prices from related services. Mark hasUnknownPrices=true whenever at least one service has unknown price.";

const SYSTEM_PROMPT = [
  "You are a structured-data extractor for a multi-tenant voice receptionist.",
  "Consolidate the provided markdown pages (one business / clinic / shop) into a single JSON object.",
  "Output JSON only, conforming to ScraperOutput shape.",
  "",
  "Required top-level fields: sourceUrl (string URL), scrapedAt (ISO 8601), tenant.name (string).",
  "Optional arrays: staff[], services[], faq[]. Use [] when nothing is present.",
  "",
  CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES,
  "",
  "For each service emit { name, synonyms[], nfzCovered: \"full\"|\"partial\"|\"none\"|\"unknown\", price?: { amount: number | \"unknown\", currency: \"PLN\" } }.",
  "For each staff member emit { name, role?, specialization?, languages[] }.",
  "For each FAQ emit { question, answer }.",
  "Polish synonyms should be front-loaded for each service.",
  "Do not invent staff names, prices, hours, or services. Do not fabricate.",
].join("\n");

export interface ConsolidateArgs {
  rootUrl: string;
  pages: FirecrawlPage[];
  llm: LLMClient;
  now?: () => Date;
}

function buildUserPrompt(rootUrl: string, pages: FirecrawlPage[]): string {
  const blocks = pages.map(
    (p, i) =>
      `--- Page ${i + 1}: ${p.url} ---\n${p.markdown.slice(0, 20000)}`,
  );
  return [
    `Root URL: ${rootUrl}`,
    `Pages: ${pages.length}`,
    "",
    ...blocks,
  ].join("\n\n");
}

export async function consolidate(args: ConsolidateArgs): Promise<ScraperOutput> {
  const now = args.now ?? (() => new Date());
  const result = await args.llm.generateStructured({
    model: "gemini-3.1-pro-preview",
    fallbackChain: ["gemini-2.5-pro", "gemini-3-flash-preview"],
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(args.rootUrl, args.pages),
    schema: ScraperOutputSchema,
    temperature: 0,
    maxOutputTokens: 8192,
  });
  const out = result.data;
  const hasUnknown = out.services.some(
    (s) => s.price?.amount === "unknown",
  );
  if (hasUnknown && !out.hasUnknownPrices) {
    return { ...out, hasUnknownPrices: true };
  }
  // Suppress unused `now` warning while leaving the hook available for callers
  // that want to override `scrapedAt` via the model. The model emits scrapedAt
  // per the prompt; `now` is reserved for future deterministic stamping.
  void now;
  return out;
}

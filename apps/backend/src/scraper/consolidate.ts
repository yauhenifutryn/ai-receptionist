import {
  ScraperOutputSchema,
  type ScraperOutput,
} from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import type { FirecrawlPage } from "./firecrawl.js";

/**
 * Gemini-side JSON Schema (OpenAPI 3.0 subset) for ScraperOutput. Used as
 * responseSchema so the model returns the exact shape ScraperOutputSchema
 * (Zod) expects. Mirrors packages/contracts/src/scraper.schema.ts — keep
 * in sync if that contract changes.
 */
const SCRAPER_OUTPUT_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    sourceUrl: { type: "STRING" },
    scrapedAt: { type: "STRING" },
    tenant: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        address: { type: "STRING" },
        phone: { type: "STRING" },
        email: { type: "STRING" },
        description: { type: "STRING" },
        hours: {
          type: "OBJECT",
          properties: {
            monday: { type: "STRING" },
            tuesday: { type: "STRING" },
            wednesday: { type: "STRING" },
            thursday: { type: "STRING" },
            friday: { type: "STRING" },
            saturday: { type: "STRING" },
            sunday: { type: "STRING" },
            notes: { type: "STRING" },
          },
        },
      },
      required: ["name"],
    },
    staff: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING" },
          specialization: { type: "STRING" },
          languages: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["name"],
      },
    },
    services: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          synonyms: { type: "ARRAY", items: { type: "STRING" } },
          description: { type: "STRING" },
          durationMinutes: { type: "INTEGER" },
          nfzCovered: {
            type: "STRING",
            enum: ["full", "partial", "none", "unknown"],
          },
          requiresConsultationFirst: { type: "BOOLEAN" },
          // price.amount is union(number | "unknown") which Gemini's
          // OpenAPI subset can't express. Constraining only `currency`
          // and leaving `amount` unspecified lets the model return either
          // shape; Zod handles the union on the receive side.
          price: {
            type: "OBJECT",
            properties: {
              currency: { type: "STRING", enum: ["PLN"] },
            },
            required: ["currency"],
          },
        },
        required: ["name"],
      },
    },
    faq: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          answer: { type: "STRING" },
        },
        required: ["question", "answer"],
      },
    },
    unsorted: { type: "STRING" },
    hasUnknownPrices: { type: "BOOLEAN" },
  },
  required: ["sourceUrl", "scrapedAt", "tenant"],
} as const;

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

/**
 * Per-page char cap inside the consolidation prompt. Set to a very high
 * value (effectively no cap for normal sites) so we don't accidentally
 * truncate the page that has the prices. Gemini Pro's 1M-token context
 * comfortably swallows 35 pages of 50K chars each.
 */
const PER_PAGE_CHAR_CAP = 50000;

function buildUserPrompt(rootUrl: string, pages: FirecrawlPage[]): string {
  const blocks = pages.map(
    (p, i) =>
      `--- Page ${i + 1}: ${p.url} ---\n${p.markdown.slice(0, PER_PAGE_CHAR_CAP)}`,
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
    jsonSchema: SCRAPER_OUTPUT_JSON_SCHEMA,
    temperature: 0,
    // Set to the model's hard ceiling, not a self-imposed limit. Big
    // clinics with deep service catalogs + multi-paragraph descriptions
    // can emit 30K+ tokens; we'd rather let Gemini finish than truncate
    // mid-JSON. If the model itself supports more in the future, raise
    // this. (KB output is intentionally unbounded — never cap the user's
    // knowledge.)
    maxOutputTokens: 65535,
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

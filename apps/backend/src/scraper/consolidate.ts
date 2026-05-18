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
          // Universal price shape — handles exact / range / from / to /
          // starting / unknown. All numeric fields optional so Gemini
          // can omit min when only max is present, etc.
          price: {
            type: "OBJECT",
            properties: {
              currency: { type: "STRING", enum: ["PLN"] },
              display: { type: "STRING" },
              min: { type: "NUMBER" },
              max: { type: "NUMBER" },
              qualifier: {
                type: "STRING",
                enum: ["exact", "from", "to", "range", "starting", "unknown"],
              },
              variant: { type: "STRING" },
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
  "Hard rule: never invent prices. If NO price is in the source markdown, omit the price field entirely OR set qualifier=\"unknown\". But if a price IS in the source — including a RANGE like \"od 4 000 do 18 000 PLN\" or \"250-400 PLN\" or \"od 380 PLN\" — capture it. Mark hasUnknownPrices=true whenever at least one service has no concrete price.";

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
  "PRICE EXTRACTION RULES — read carefully, this is where you most often fail:",
  "Real clinic prices come in many shapes. Map them like this:",
  "  - \"200 PLN\"                  → { currency:\"PLN\", display:\"200 PLN\", min:200, max:200, qualifier:\"exact\" }",
  "  - \"250-400 PLN\"              → { currency:\"PLN\", display:\"250-400 PLN\", min:250, max:400, qualifier:\"range\" }",
  "  - \"od 4 000 do 18 000 PLN\"   → { currency:\"PLN\", display:\"od 4 000 do 18 000 PLN\", min:4000, max:18000, qualifier:\"range\" }",
  "  - \"od 380 PLN\"               → { currency:\"PLN\", display:\"od 380 PLN\", min:380, qualifier:\"from\" }",
  "  - \"od 350 PLN\"               → { currency:\"PLN\", display:\"od 350 PLN\", min:350, qualifier:\"from\" }",
  "  - \"od 3500 PLN\" (no spaces)  → { currency:\"PLN\", display:\"od 3500 PLN\", min:3500, qualifier:\"from\" }",
  "  - variant like \"dzieci do 10 lat 150 PLN\" → set variant:\"dzieci do 10 lat\", min:150, max:150, qualifier:\"exact\"",
  "  - \"na zapytanie\" / no number → { currency:\"PLN\", qualifier:\"unknown\" } OR omit price entirely",
  "STRICT RULES:",
  "  - qualifier=\"range\" REQUIRES BOTH min AND max populated (e.g., \"500-900 PLN\" → min:500 AND max:900). Never set qualifier=\"range\" with only one of them — use \"from\" instead if only the lower bound is known.",
  "  - qualifier=\"exact\" REQUIRES min=max (both the same number).",
  "  - `variant` is for caller-segmenting qualifiers ONLY (e.g., \"dzieci\", \"dorośli\", \"z aparatem ortodontycznym\"). NEVER put the price text into variant. If there is no segmenting qualifier, omit variant.",
  "  - Always preserve the verbatim source text in `display` so the agent can quote it.",
  "  - Strip thousands separators (\"4 000\" → 4000) when filling min/max.",
  "If the same service appears at multiple price points across the source (e.g. /cennik page lists multiple variants), pick the most common shape or create ONE service entry whose price covers the full observed range.",
  "",
  "For each service emit { name, synonyms[], nfzCovered, price?, durationMinutes? }.",
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
 * Per-page char cap inside the consolidation prompt. Set very high so
 * we never truncate the page that contains pricing or other late-in-
 * the-page detail. Project is on Gemini Paid Tier (2M input tokens/min)
 * so cost / rate limits aren't the binding constraint anymore — only
 * Gemini Pro's 1M-token context window matters, and 50K * 35 = ~437K
 * tokens fits with margin.
 *
 * If a deployment ever drops back to free tier (250K tokens/min), this
 * cap should drop too — but priority is quality, not cost.
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
    // Gemini 3 Flash (preview) is the newest-gen text Flash on Google AI
    // Studio. Note: `gemini-3.1-flash` doesn't exist — Google only
    // shipped 3.1 Flash variants for image/TTS/live modalities, not
    // text. The 3.x text Flash is `gemini-3-flash-preview`.
    //
    // Fallback chain prioritizes stability over generation:
    //   1) Stable 2.5 flash — proven reliable on big consolidations
    //   2) Pro preview — last-ditch if both Flash variants fail
    model: "gemini-3-flash-preview",
    fallbackChain: ["gemini-2.5-flash", "gemini-3.1-pro-preview"],
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(args.rootUrl, args.pages),
    schema: ScraperOutputSchema,
    jsonSchema: SCRAPER_OUTPUT_JSON_SCHEMA,
    temperature: 0,
    // KB OUTPUT is unbounded by policy — model's hard ceiling only.
    // Big catalogs can emit 30K+ tokens, never truncate mid-JSON.
    maxOutputTokens: 65535,
  });
  const out = result.data;
  const hasUnknown = out.services.some(
    (s) =>
      !s.price ||
      s.price.qualifier === "unknown" ||
      (typeof s.price.min !== "number" && typeof s.price.max !== "number"),
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

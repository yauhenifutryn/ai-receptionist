import { ScraperOutputSchema, type ScraperOutput } from "@ai-receptionist/contracts";
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
        // All 7 days REQUIRED (constrained decoding), mirroring the price
        // display/qualifier trick. With optional day fields the model
        // expanded "pon-pt 9-19" to monday/tuesday/wednesday and STOPPED —
        // observed on 3 different sites in a row, even after explicit
        // prompt rules (2026-06-06). Days the source doesn't mention are
        // emitted as "brak danych"; closed days as "zamknięte" (see
        // HOURS EXTRACTION RULES in the system prompt).
        hours: {
          type: "OBJECT",
          propertyOrdering: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
            "notes",
          ],
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
          required: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
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
          // starting / unknown.
          //
          // GROUNDING (critical): propertyOrdering forces Gemini to emit
          // `display` (verbatim source quote) BEFORE the numeric fields.
          // Autoregressive models commit to early tokens; once display
          // is set ("1500 PLN"), min/max/qualifier flow from it
          // mechanically. Without this, the model can satisfy the
          // schema with `{currency:"PLN"}` and skip — the failure mode
          // we observed where 28 services landed with `qualifier:
          // "unknown"` while real prices sat in scratchpad text.
          //
          // `display` + `qualifier` are required so the model cannot
          // emit a placeholder price. If a true unknown, emit
          // qualifier="unknown" + display="brak ceny" rather than
          // omitting price altogether.
          price: {
            type: "OBJECT",
            propertyOrdering: ["display", "qualifier", "currency", "min", "max", "variant"],
            properties: {
              display: { type: "STRING" },
              qualifier: {
                type: "STRING",
                enum: ["exact", "from", "to", "range", "starting", "unknown"],
              },
              currency: { type: "STRING", enum: ["PLN"] },
              min: { type: "NUMBER" },
              max: { type: "NUMBER" },
              variant: { type: "STRING" },
            },
            required: ["display", "qualifier", "currency"],
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
  'Hard rule: never invent prices. If NO price is in the source markdown, omit the price field entirely OR set qualifier="unknown". But if a price IS in the source — including a RANGE like "od 4 000 do 18 000 PLN" or "250-400 PLN" or "od 380 PLN" — capture it. Mark hasUnknownPrices=true whenever at least one service has no concrete price.';

const SYSTEM_PROMPT = [
  "You are a structured-data extractor for a multi-tenant voice receptionist.",
  "Consolidate the provided markdown pages (one business / clinic / shop) into a single JSON object.",
  "Output JSON only, conforming to ScraperOutput shape.",
  "",
  "Required top-level fields: sourceUrl (string URL), scrapedAt (ISO 8601), tenant.name (string).",
  "Optional arrays: staff[], services[], faq[]. Use [] when nothing is present.",
  "",
  // dci.waw.pl regression: the site serves Russian on unprefixed paths and
  // Polish under _pl suffixes. The KB is read aloud by a Polish-speaking
  // voice agent — Russian descriptions leaking in are a hard failure.
  "OUTPUT LANGUAGE: POLISH. All free-text output (service names, descriptions, FAQ answers, hours notes, unsorted) must be natural Polish. If source pages are in another language (e.g. Russian, English), translate the content to Polish. Keep proper names unchanged (people, brands, product names like 'ZOOM 4', street addresses). When the same page exists in both Polish and another language, prefer the Polish version's wording.",
  "",
  CONSOLIDATION_PROMPT_NEVER_INVENT_PRICES,
  "",
  "PRICE EXTRACTION RULES — read carefully, this is where you most often fail:",
  "Real clinic prices come in many shapes. Map them like this:",
  '  - "200 PLN"                  → { currency:"PLN", display:"200 PLN", min:200, max:200, qualifier:"exact" }',
  '  - "250-400 PLN"              → { currency:"PLN", display:"250-400 PLN", min:250, max:400, qualifier:"range" }',
  '  - "od 4 000 do 18 000 PLN"   → { currency:"PLN", display:"od 4 000 do 18 000 PLN", min:4000, max:18000, qualifier:"range" }',
  '  - "od 380 PLN"               → { currency:"PLN", display:"od 380 PLN", min:380, qualifier:"from" }',
  '  - "od 350 PLN"               → { currency:"PLN", display:"od 350 PLN", min:350, qualifier:"from" }',
  '  - "od 3500 PLN" (no spaces)  → { currency:"PLN", display:"od 3500 PLN", min:3500, qualifier:"from" }',
  '  - variant like "dzieci do 10 lat 150 PLN" → set variant:"dzieci do 10 lat", min:150, max:150, qualifier:"exact"',
  '  - "na zapytanie" / no number → { currency:"PLN", qualifier:"unknown" } OR omit price entirely',
  "GLUED PRICE ROWS (critical — annadentalclinic.com regression): scrapers flatten two-column price tables into runs where the service name and the price are CONCATENATED without a space:",
  '  - "Przegląd uzębienia150 zł"        → name "Przegląd uzębienia", price { display:"150 zł", min:150, max:150, qualifier:"exact" }',
  '  - "Licówka porcelanowaod 2 500 zł"  → name "Licówka porcelanowa", price { display:"od 2 500 zł", min:2500, qualifier:"from" }',
  '  - "Wypełnienie kompozytowe500 – 600 zł" → name "Wypełnienie kompozytowe", price { display:"500 – 600 zł", min:500, max:600, qualifier:"range" }',
  "These ARE real published price rows. Split the trailing price expression from the name and capture it normally.",
  'PRICE DISCLAIMERS do not erase prices: phrases like "podane przykładowe ceny mają formę informacyjną" or "ceny mogą się różnić" mean the numbers are reference prices — STILL capture them as listed. Only mark unknown when no number is published at all.',
  'A price belongs ONLY to the service row it is printed with. Never transfer it to a similarly-named but different service (observed: "Fluoryzacja / Lakierowanie — 150 zł" wrongly copied onto "Lakowanie zębów", a different procedure with no published price).',
  "STRICT RULES:",
  '  - qualifier="range" REQUIRES BOTH min AND max populated (e.g., "500-900 PLN" → min:500 AND max:900). Never set qualifier="range" with only one of them — use "from" instead if only the lower bound is known.',
  '  - qualifier="exact" REQUIRES min=max (both the same number).',
  '  - `variant` is for caller-segmenting qualifiers ONLY (e.g., "dzieci", "dorośli", "z aparatem ortodontycznym"). NEVER put the price text into variant. If there is no segmenting qualifier, omit variant.',
  "  - Always preserve the verbatim source text in `display` so the agent can quote it.",
  '  - Strip thousands separators ("4 000" → 4000) when filling min/max.',
  "If the same service appears at multiple price points across the source (e.g. /cennik page lists multiple variants), pick the most common shape or create ONE service entry whose price covers the full observed range.",
  "",
  "PRICE-LIST COMPLETENESS (critical): when a page is a price list (cennik) — many rows of 'name … NNN PLN' — you MUST emit a separate priced service for EVERY single row. Do NOT summarize, sample, group, or stop early on a price list. A page with 100 priced rows must yield ~100 priced services. Dropping price-list rows is a hard error: those prices are the single most valuable output.",
  "",
  // dci.waw.pl regression: footer said "Пн-Пт 9:00-20:00, Сб 9:00-16:00,
  // Вс — выходной"; the model emitted monday/tuesday/wednesday and stopped.
  // The agent then 'knew' the clinic was closed Thu-Sun.
  "HOURS EXTRACTION RULES (critical):",
  "  - When you emit tenant.hours, ALL SEVEN days are required by the schema.",
  '  - Day ranges ("Pon-Pt 9:00-20:00", "Пн-Пт", "Mo-Fr", "pn – pt") expand to EVERY day in the range: monday, tuesday, wednesday, thursday AND friday each get the value. Never stop mid-range.',
  '  - Days marked closed get "zamknięte" ("Вс — выходной" / "niedziela nieczynne" → sunday: "zamknięte").',
  '  - Days the source says NOTHING about get "brak danych" (typically saturday/sunday on Mon-Fri-only sites). Never guess.',
  '  - Day values are plain hour text like "09:00-19:00" — no quotes, no trailing punctuation, no copied JSON fragments.',
  "  - If locations differ in hours, fill the day fields with the main location's hours and put per-location detail into hours.notes, labelled by location name.",
  "",
  "For each service emit { name, synonyms[], nfzCovered, price?, durationMinutes? }.",
  "For each staff member emit { name, role?, specialization?, languages[] }.",
  "For each FAQ emit { question, answer }.",
  "Polish synonyms should be front-loaded for each service.",
  "Do not invent staff names, prices, hours, or services. Do not fabricate.",
  "",
  "ANTI-REPETITION RULES — read carefully:",
  "  - Once a service / staff / FAQ entry is emitted, NEVER emit it again.",
  "  - NEVER repeat a phrase, sentence, or service marker more than twice in the output.",
  "  - Once you finish the JSON object's closing brace, STOP — emit no further characters.",
  "  - If you find yourself about to emit the same content again, terminate the JSON immediately.",
].join("\n");

export interface ConsolidateArgs {
  rootUrl: string;
  pages: FirecrawlPage[];
  llm: LLMClient;
  now?: () => Date;
  /** Cancel the in-flight Gemini call when the client disconnects or hits Cancel. */
  signal?: AbortSignal;
  /**
   * Override the model chain. Chunked-batch callers should pass
   * `{ model: "gemini-2.5-flash", fallbackChain: [] }` — on 3-page
   * batches, 2.5-flash is both faster (~7s vs 6-300s+) and extracts more
   * services than 3-flash-preview, AND it reliably finishes inside
   * Vercel's 300s lambda window. 3-flash-preview's quality edge only
   * matters on big (35-page) single-shot inputs.
   */
  model?: import("../lib/llm.js").LLMModel;
  fallbackChain?: import("../lib/llm.js").LLMModel[];
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
export const PER_PAGE_CHAR_CAP = 50000;

/**
 * Bounded thinking budget for consolidation. Positive (not 0) so
 * gemini-2.5-pro runs at all and so neither model falls into the Polish
 * repetition loop. Bounded (not the model default of dynamic/unbounded) so a
 * 3-page batch finishes well inside Vercel's 300s lambda.
 */
export const CONSOLIDATE_THINKING_BUDGET = 4096;

function buildUserPrompt(rootUrl: string, pages: FirecrawlPage[]): string {
  const blocks = pages.map(
    (p, i) => `--- Page ${i + 1}: ${p.url} ---\n${p.markdown.slice(0, PER_PAGE_CHAR_CAP)}`,
  );
  return [`Root URL: ${rootUrl}`, `Pages: ${pages.length}`, "", ...blocks].join("\n\n");
}

export async function consolidate(args: ConsolidateArgs): Promise<ScraperOutput> {
  const now = args.now ?? (() => new Date());
  const result = await args.llm.generateStructured({
    // Primary `gemini-2.5-pro`: only Gemini model that can ACTUALLY
    // disable thinking (Gemini 3 Flash silently coerces thinkingBudget=0
    // to "minimal" and leaks reasoning text into the response — see
    // vercel/ai#11396 + the missing-prices incident 2026-05-28). Pro
    // has 1M context, predictable 10-40s latency on our batch size,
    // no scratchpad-leak bug, ~$1.80/provision.
    //
    // Fallback `gemini-2.5-flash` — faster but loops on long Polish
    // service lists (the "dbałość o dbałość o..." pathology). Only
    // useful as last-resort when Pro itself fails transport.
    //
    // maxRetries=0: long expensive calls. If primary throws transport
    // error we want to fall through to next model IMMEDIATELY — never
    // retry the same model on the same giant prompt.
    model: args.model ?? "gemini-2.5-pro",
    fallbackChain: args.fallbackChain ?? ["gemini-2.5-flash"],
    maxRetries: 0,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(args.rootUrl, args.pages),
    schema: ScraperOutputSchema,
    jsonSchema: SCRAPER_OUTPUT_JSON_SCHEMA,
    // temperature 0.2 (not 0) because at temp=0 Gemini Flash falls into
    // degenerate emission loops on long structured outputs — we observed
    // the model stuck emitting "(Koniec). (Koniec). (Koniec)..." until
    // truncation. 0.2 keeps sampling near-deterministic but escapes the
    // greedy loop trap. Reference: classic failure mode of low-temp
    // structured extraction on Polish (high-repetition-prior) inputs.
    temperature: 0.2,
    // NB: frequencyPenalty/presencePenalty are NOT usable here — the Gemini
    // API rejects them on gemini-2.5-pro / 2.5-flash with
    // "400 Penalty is not enabled for models/...". The anti-loop levers we
    // DO have are the temperature (0.2, not 0) and the ANTI-REPETITION RULES
    // in SYSTEM_PROMPT. If runaway loops resurface on real sites, the robust
    // fix is OpenAI gpt-5.4-mini strict structured output (grammar-constrained,
    // cannot loop into invalid JSON) — see memory gpt_5_4_mini_consolidation.
    // KB OUTPUT is unbounded by policy — model's hard ceiling only.
    // Big catalogs can emit 30K+ tokens, never truncate mid-JSON.
    maxOutputTokens: 65535,
    // BOUNDED thinking (not 0). Two reasons, both learned the hard way
    // 2026-05-28/29:
    //   1. gemini-2.5-pro REJECTS thinkingBudget:0 ("Budget 0 is invalid.
    //      This model only works in thinking mode."), so with budget 0 the
    //      primary always 400'd and silently fell back to 2.5-flash. A
    //      positive budget lets 2.5-pro actually run.
    //   2. The degenerate repetition loops (model emitting the same Polish
    //      service name hundreds of times until it blows maxOutputTokens and
    //      truncates mid-JSON) happened specifically at thinkingBudget:0.
    //      Thinking gives the model a planning scratchpad that keeps the
    //      structured output coherent — on the exclusivedentalstudio.pl
    //      batches, budget 0 looped ~50% of batches; bounded thinking does
    //      not. Bounded (not dynamic/unbounded) so per-batch latency stays
    //      well under Vercel's 300s lambda ceiling.
    thinkingBudget: CONSOLIDATE_THINKING_BUDGET,
    ...(args.signal !== undefined ? { abortSignal: args.signal } : {}),
  });
  // scrapedAt is stamped deterministically — the model hallucinates dates
  // (emitted "2024-07-29" on a 2026-06-06 run; it cannot know today's date).
  const out = { ...result.data, scrapedAt: now().toISOString() };
  const hasUnknown = out.services.some(
    (s) =>
      !s.price ||
      s.price.qualifier === "unknown" ||
      (typeof s.price.min !== "number" && typeof s.price.max !== "number"),
  );
  if (hasUnknown && !out.hasUnknownPrices) {
    return { ...out, hasUnknownPrices: true };
  }
  return out;
}

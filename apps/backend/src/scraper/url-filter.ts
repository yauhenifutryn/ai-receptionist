/**
 * URL filter — pure mechanical-noise drops only. Every content-shaped
 * decision is delegated to the LLM rerank, which can apply semantic
 * judgment per-site. This file used to carry topic blocklists ("blog",
 * "privacy", "career"…) but those were brittle: every site is different,
 * and the dental-clinic regression that took out `/service-category/*`
 * (because "category" was in the list) proved the cost of guessing.
 *
 * What stays here:
 *   1. URLs that physically can't be scraped to markdown:
 *      - Binary file extensions (.pdf, .jpg, .xml, .zip, …)
 *      - WordPress / CMS admin endpoints (/wp-admin, /wp-json, …)
 *   2. URLs that are byte-for-byte duplicates of others:
 *      - Paginated archives `/page/N/`
 *      - Date-archive paths `/YYYY/MM/`
 *      - Non-Polish language translations (separate dedupeByLanguage step)
 *
 * Everything else — yes, even `/blog/`, `/cookie-banner/`, `/careers/` —
 * passes through to the rerank, which scores it 0-1 and lets pickByScore
 * decide. If the LLM rerank itself fails, the safe default is to scrape
 * more, not less; we'd rather burn a few extra Firecrawl credits than
 * miss the pricing page.
 */

/**
 * Truly mechanical noise: these are not content decisions. wp-admin
 * returns an admin login page; binary files Firecrawl can't markdownify;
 * paginated archives are duplicates of page 1.
 */
const MECHANICAL_BLOCKED_SEGMENTS: ReadonlySet<string> = new Set([
  "wp-admin",
  "wp-json",
  "wp-content",
  "wp-includes",
]);

const MECHANICAL_BLOCKED_REGEX: ReadonlyArray<RegExp> = [
  // Pagination — duplicate content of underlying archive
  /\/page\/\d+/i,
  // Date archives like /2023/04/post-title — duplicate of canonical post
  /\/\d{4}\/\d{2}\//,
  // Binary / non-html that Firecrawl can't convert to markdown
  /\.(jpg|jpeg|png|gif|webp|svg|ico|bmp|tiff?|pdf|zip|tar|gz|rar|7z|mp4|mp3|wav|m4a|mov|avi|webm|xml|xsl|json|rss|atom|css|js|woff2?|ttf|eot)$/i,
];

const PRIMARY_LANG = "pl";

/**
 * Common ISO-639-1 codes that appear as language namespaces in real
 * multilingual sites. Used to gate Rule 1 (transitive detection) so
 * accidental 2-letter slugs like `/ai/` or `/qa/` aren't misclassified
 * as languages. Not exhaustive — only codes we've seen on production
 * sites in the EU/PL market. Add more as needed.
 */
const KNOWN_ISO_LANGS: ReadonlySet<string> = new Set([
  "pl", "en", "de", "fr", "es", "it", "pt", "ru", "uk", "be", "cs", "sk",
  "nl", "hu", "ro", "bg", "tr", "hr", "sl", "sv", "da", "fi", "no", "et",
  "lv", "lt", "el", "ar", "zh", "ja", "ko", "he", "fa", "vi", "th", "id",
  "ms", "ga", "mt", "is", "sq", "mk", "sr", "bs", "ka", "hy", "az", "kk",
  "uz", "ky", "tt", "ba", "tg", "mn", "ne", "hi", "bn", "ur", "ta", "te",
]);

export interface FilterCandidatesResult {
  kept: string[];
  droppedJunk: string[];
  droppedTranslations: string[];
  detectedLanguagePrefixes: string[];
}

/**
 * Per-URL mechanical-noise filter. Drops only what physically can't
 * be scraped or is provably duplicate content. NO content judgments.
 */
export function shouldScrape(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segments = parsed.pathname
    .toLowerCase()
    .split("/")
    .filter((s) => s.length > 0);
  for (const seg of segments) {
    if (MECHANICAL_BLOCKED_SEGMENTS.has(seg)) return false;
  }
  const lower = url.toLowerCase();
  for (const re of MECHANICAL_BLOCKED_REGEX) {
    if (re.test(lower)) return false;
  }
  return true;
}

/**
 * Detect language prefixes purely from the URL set. Three rules:
 *
 *   Rule 1 (transitive, ISO-gated): if 2+ distinct 2-letter first-segments
 *     appear AND at least one is in KNOWN_ISO_LANGS, all the *language-
 *     looking* prefixes in the set are treated as languages. Real
 *     localizations always come in sets, so /en/ + /uk/ = near-certain
 *     both are languages. The ISO gate prevents pathological co-occurrence
 *     of unrelated 2-letter slugs like `/ai/` + `/qa/` from being dropped.
 *
 *   Rule 2 (singleton allowlist): a lone 2-letter prefix is treated as a
 *     language if it's in KNOWN_ISO_LANGS — `/en/contact` alone is a
 *     strong-enough signal that the whole namespace is English.
 *
 *   Rule 3 (singleton fallback): if it's NOT in KNOWN_ISO_LANGS, fall
 *     back to multiplicity (3+ URLs) or tail-overlap with an unprefixed
 *     path before treating it as a language.
 *
 * Returns the set of detected prefixes (e.g. {"en", "uk", "ru"}).
 */
export function detectLanguagePrefixes(urls: string[]): Set<string> {
  const prefixToTails = new Map<string, Set<string>>();
  const unprefixedTails = new Set<string>();

  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    const segs = parsed.pathname.split("/").filter((s) => s.length > 0);
    if (segs.length === 0) continue;
    const first = segs[0]!.toLowerCase();
    if (/^[a-z]{2}$/.test(first)) {
      const tail = "/" + segs.slice(1).join("/");
      if (!prefixToTails.has(first)) prefixToTails.set(first, new Set());
      prefixToTails.get(first)!.add(tail);
    } else {
      unprefixedTails.add(parsed.pathname);
    }
  }

  const prefixes = Array.from(prefixToTails.keys());
  const isoPrefixes = prefixes.filter((p) => KNOWN_ISO_LANGS.has(p));

  // Rule 1: 2+ distinct 2-letter prefixes AND at least one is ISO ->
  // treat every ISO prefix in the set as a language. Non-ISO prefixes
  // that just happened to co-occur (e.g. /ai/, /qa/) are NOT flagged.
  if (prefixes.length >= 2 && isoPrefixes.length >= 1) {
    return new Set(isoPrefixes);
  }

  // Rule 2 + 3: singleton handling.
  const detected = new Set<string>();
  for (const [prefix, tails] of prefixToTails) {
    if (KNOWN_ISO_LANGS.has(prefix)) {
      // Rule 2: ISO singleton is enough on its own.
      detected.add(prefix);
    } else {
      // Rule 3: non-ISO singleton needs hard evidence.
      let overlap = 0;
      for (const t of tails) if (unprefixedTails.has(t)) overlap++;
      if (overlap >= 1 || tails.size >= 3) detected.add(prefix);
    }
  }
  return detected;
}

/**
 * Drop URLs that live under a detected non-Polish language prefix.
 * Keeps the Polish prefix (if used) and all unprefixed URLs.
 *
 * Safe net: if dedup would drop every URL (purely non-Polish site),
 * keep everything — we'd rather scrape non-Polish content than nothing.
 */
export function dedupeByLanguage(urls: string[]): {
  kept: string[];
  dropped: string[];
  detectedPrefixes: string[];
} {
  const detected = detectLanguagePrefixes(urls);
  const dropPrefixes = new Set<string>();
  for (const p of detected) if (p !== PRIMARY_LANG) dropPrefixes.add(p);

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      dropped.push(u);
      continue;
    }
    const segs = parsed.pathname.split("/").filter((s) => s.length > 0);
    const first = segs[0]?.toLowerCase() ?? "";
    if (first && dropPrefixes.has(first)) {
      dropped.push(u);
    } else {
      kept.push(u);
    }
  }
  if (kept.length === 0 && urls.length > 0) {
    return {
      kept: [...urls],
      dropped: [],
      detectedPrefixes: Array.from(detected).sort(),
    };
  }
  return { kept, dropped, detectedPrefixes: Array.from(detected).sort() };
}

/**
 * Top-level entrypoint. Applies mechanical-noise filter then language
 * dedup. Every content-shape decision is left to the downstream LLM
 * rerank — this function will NOT drop a URL just because it contains
 * the word "blog" or "career" or "category". Per the rule of thumb:
 * scrape everything except completely obvious noise.
 */
export function filterCandidates(urls: string[]): FilterCandidatesResult {
  const afterJunk: string[] = [];
  const droppedJunk: string[] = [];
  for (const u of urls) {
    if (shouldScrape(u)) afterJunk.push(u);
    else droppedJunk.push(u);
  }
  const { kept, dropped, detectedPrefixes } = dedupeByLanguage(afterJunk);
  return {
    kept,
    droppedJunk,
    droppedTranslations: dropped,
    detectedLanguagePrefixes: detectedPrefixes,
  };
}

/**
 * Default search query used when running Firecrawl `map` for a generic
 * receptionist scrape. Polish-first, covers the canonical sections we expect
 * in the knowledge document. Tenants in different verticals can override.
 */
export const DEFAULT_RELEVANCE_QUERY =
  "kontakt godziny usługi cennik lekarze faq oferta zespół o nas about services pricing contact hours team";

/**
 * Heuristic URL filter — drops obvious junk and non-Polish translations
 * before Firecrawl scrape so we don't burn credits or scrape budget on
 * blog archives, cookie pages, sitemaps, or 4 language variants of the
 * same doctor page.
 *
 * Two layers:
 *
 *   1. shouldScrape(url): per-URL junk filter. Path-segment matching with
 *      word-split, so "/privacy-policy-and-information" drops because
 *      'privacy' is one of the words in the segment.
 *
 *   2. dedupeByLanguage(urls): set-level translation collapse. Detects
 *      language prefixes semantically from the URL set itself (no
 *      hardcoded ISO list). For each detected language namespace that
 *      isn't Polish, drops every URL under it. If a URL has no Polish
 *      version available, the non-Polish version is kept so we don't
 *      lose content on English-only or Ukrainian-only sites.
 *
 * filterCandidates(urls) is the top-level entrypoint used by /api/prepare.
 * It returns the kept set + structured drop reasons so the wizard can
 * show the user exactly what was removed and why.
 */

const BLOCKED_WORDS: ReadonlySet<string> = new Set([
  "blog",
  "blogi",
  "news",
  "aktualnosci",
  "aktualności",
  "press",
  "prasa",
  "career",
  "careers",
  "kariera",
  "praca",
  "job",
  "jobs",
  "privacy",
  "prywatnosci",
  "prywatności",
  "polityka",
  "terms",
  "regulamin",
  "cookie",
  "cookies",
  "ciasteczka",
  "tag",
  "tags",
  "author",
  "autor",
  "category",
  "kategoria",
  "search",
  "szukaj",
  "404",
  "feed",
  "rss",
  "sitemap",
  "login",
  "logowanie",
  "register",
  "rejestracja",
  "checkout",
  "koszyk",
  "cart",
]);

const BLOCKED_WP_SEGMENTS: ReadonlySet<string> = new Set([
  "wp-json",
  "wp-admin",
  "wp-content",
  "wp-includes",
]);

const BLOCKED_REGEX: ReadonlyArray<RegExp> = [
  /\/page\/\d+/i,
  /\/\d{4}\/\d{2}\//,
  /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|wav)$/i,
];

const PRIMARY_LANG = "pl";

export interface FilterCandidatesResult {
  kept: string[];
  droppedJunk: string[];
  droppedTranslations: string[];
  detectedLanguagePrefixes: string[];
}

/**
 * Per-URL junk filter. Drops paths whose segments match blocked words,
 * obvious admin/template prefixes, or known binary/archive patterns.
 *
 * Segment matching is word-level: each "/seg/" is split on '-' and each
 * word checked against BLOCKED_WORDS. This catches segments like
 * 'privacy-policy-and-information' or 'cookie-settings'.
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
    if (BLOCKED_WP_SEGMENTS.has(seg)) return false;
    const words = seg.split(/[-_]/).filter((w) => w.length > 0);
    for (const w of words) {
      if (BLOCKED_WORDS.has(w)) return false;
    }
  }
  const lower = url.toLowerCase();
  for (const re of BLOCKED_REGEX) {
    if (re.test(lower)) return false;
  }
  return true;
}

/**
 * Detect language prefixes purely from the URL set. Two rules:
 *
 *   Rule 1 (transitive): if 2+ distinct 2-letter first-segments appear
 *     across the URL set, every one of them is treated as a language
 *     namespace. Real localizations always come in sets, so seeing /en/
 *     alongside /uk/ is near-certain proof both are languages — even if
 *     each appears only once.
 *
 *   Rule 2 (singleton fallback): when only one 2-letter prefix appears,
 *     require multiplicity (3+ URLs) or tail-overlap with an unprefixed
 *     path to avoid misclassifying a one-off page like /ai or /qa.
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

  // Rule 1: 2+ distinct 2-letter prefixes -> all are languages.
  if (prefixToTails.size >= 2) {
    return new Set(prefixToTails.keys());
  }

  // Rule 2: single prefix only -> require multiplicity or overlap.
  const detected = new Set<string>();
  for (const [prefix, tails] of prefixToTails) {
    let overlap = 0;
    for (const t of tails) if (unprefixedTails.has(t)) overlap++;
    if (overlap >= 1 || tails.size >= 3) detected.add(prefix);
  }
  return detected;
}

/**
 * Drop URLs that live under a detected non-Polish language prefix.
 * Keeps the Polish prefix (if used) and all unprefixed URLs.
 *
 * Safe on English-only or single-language sites: detection requires
 * multiple URLs under a prefix OR overlap with unprefixed paths, so a
 * site with just `/en/` and nothing else gets all URLs kept.
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
  // Safety net: never zero out the kept set. If dedup would drop every
  // URL (e.g., a site with only English+Ukrainian and no Polish), keep
  // everything — we'd rather scrape non-Polish content than nothing.
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
 * Top-level entrypoint. Applies junk filter then language dedup and
 * returns structured drop reasons so the caller can surface them in
 * progress events and session artifacts.
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

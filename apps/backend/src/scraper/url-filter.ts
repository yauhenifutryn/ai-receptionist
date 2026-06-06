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
  "pl",
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "ru",
  "uk",
  "be",
  "cs",
  "sk",
  "nl",
  "hu",
  "ro",
  "bg",
  "tr",
  "hr",
  "sl",
  "sv",
  "da",
  "fi",
  "no",
  "et",
  "lv",
  "lt",
  "el",
  "ar",
  "zh",
  "ja",
  "ko",
  "he",
  "fa",
  "vi",
  "th",
  "id",
  "ms",
  "ga",
  "mt",
  "is",
  "sq",
  "mk",
  "sr",
  "bs",
  "ka",
  "hy",
  "az",
  "kk",
  "uz",
  "ky",
  "tt",
  "ba",
  "tg",
  "mn",
  "ne",
  "hi",
  "bn",
  "ur",
  "ta",
  "te",
]);

/**
 * Canonicalize a URL into a stable dedupe key.
 *
 * Lowercases host, strips `www.` prefix, drops default ports (80/443),
 * strips trailing slashes from pathname, drops query string and fragment.
 * Pathname case is preserved (some servers serve case-sensitive paths).
 *
 * Use this as the key when comparing URLs across the pipeline — Firecrawl
 * may return `www.example.com/x/` while a markdown link uses
 * `example.com/x`. Without canonicalization the same logical page gets
 * scraped twice, eating Vercel timeout budget for nothing.
 *
 * Returns null if the input is unparseable.
 */
export function canonicalizeUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const isDefaultPort =
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443");
  const portPart = parsed.port && !isDefaultPort ? `:${parsed.port}` : "";
  const pathPart = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${host}${portPart}${pathPart}`;
}

/**
 * Detect a site's primary content language from its root-URL redirect.
 *
 * Most sites declare their default language by redirecting `/` to
 * `/<lang>/...` (e.g. indexmedica.com → /en/, natadent.pl → /pl/wola).
 * That redirect IS the site's own declaration — more reliable than
 * guessing from URL counts or content sniffing.
 *
 * Single fetch with redirect:'manual' so we read the Location header
 * without following it. Returns the 2-letter ISO code on a clean
 * positive signal, otherwise null — the caller is expected to fall
 * back to a sensible default (typically "pl" for this codebase).
 *
 * Network errors / timeouts / non-redirect responses all return null
 * by design: this function should never throw, callers shouldn't have
 * to wrap it, and "we couldn't tell" is a valid answer.
 */
export async function detectPrimaryLanguage(
  rootUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetcher(rootUrl, { redirect: "manual" });
  } catch {
    return null;
  }
  if (res.status < 300 || res.status >= 400) return null;
  const loc = res.headers.get("location");
  if (!loc) return null;
  let target: URL;
  try {
    target = new URL(loc, rootUrl);
  } catch {
    return null;
  }
  const firstSeg = target.pathname.split("/").filter((s) => s.length > 0)[0];
  if (!firstSeg) return null;
  const lower = firstSeg.toLowerCase();
  if (!/^[a-z]{2}$/.test(lower)) return null;
  if (!KNOWN_ISO_LANGS.has(lower)) return null;
  return lower;
}

/**
 * Upgrade http:// links to https:// when the operator-supplied root URL
 * is https and the link points at the same site (host equality after
 * stripping `www.`).
 *
 * REGRESSION (dci.waw.pl, 2026-06-06): Firecrawl's map returns http://
 * links for this site; scraping them makes Firecrawl's upstream proxy
 * fail and return HTTP 200 whose markdown is literally "Invalid
 * upstream proxy credentials" (42 chars). 25 such pages consolidated
 * into a 736-char KB. The https variant of the same page returns 20K
 * chars. If the root speaks https, every same-site link can too.
 *
 * Never downgrades: an http root leaves links untouched. Other hosts
 * and unparseable strings pass through unchanged.
 */
export function upgradeToRootScheme(rootUrl: string, urls: string[]): string[] {
  let root: URL;
  try {
    root = new URL(rootUrl);
  } catch {
    return urls;
  }
  if (root.protocol !== "https:") return urls;
  const stripWww = (h: string) => (h.startsWith("www.") ? h.slice(4) : h);
  const rootHost = stripWww(root.hostname.toLowerCase());
  return urls.map((u) => {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return u;
    }
    if (parsed.protocol !== "http:") return u;
    if (stripWww(parsed.hostname.toLowerCase()) !== rootHost) return u;
    parsed.protocol = "https:";
    return parsed.toString();
  });
}

/**
 * Drop URLs that canonicalize (scheme-insensitively) to an already-seen
 * page, keeping the first occurrence. Firecrawl maps routinely return
 * the same page as `www.` and naked-host variants (dentus.szczecin.pl:
 * 626 mapped links, heavy www/naked duplication) — scraping both burns
 * credits and page budget for zero new content. Unparseable URLs are
 * kept (downstream shouldScrape decides).
 */
export function dedupeByCanonicalUrl(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const canonical = canonicalizeUrl(u)?.replace(/^https?:/, "");
    if (canonical) {
      if (seen.has(canonical)) continue;
      seen.add(canonical);
    }
    out.push(u);
  }
  return out;
}

/**
 * Collapse URL FAMILIES — 3+ URLs identical except for a trailing
 * numeric / underscore suffix on the last path segment (foo-1, foo-2,
 * … foo-17; bar, bar_, bar_2). These are template stubs rendered N
 * times (WordPress page-builder artifacts), not distinct content.
 *
 * REGRESSION (dentus.szczecin.pl): dentus-kids-1..17 + d_f-1/-5/-502 +
 * dentysci_stomatolodzy/_/_2 tied with real service pages in the LLM
 * rerank and won on alphabetical tie-break — the provisioned KB ended
 * up with 0 priced services because /zakres-uslug/* lost every slot.
 *
 * Mechanical rule only: a family needs >=3 members before collapsing
 * (2 could be legitimately distinct pages); the shortest URL (then
 * lexicographically first) survives as the family representative.
 */
export function collapseUrlFamilies(urls: string[]): string[] {
  const familyKey = (u: string): string | null => {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return null;
    }
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    const last = segs[segs.length - 1]!;
    const base = last.replace(/[-_]+\d*$/i, "");
    if (base.length === 0 || base === last) {
      // No suffix to strip — still participates as the family base.
      return `${parsed.hostname}/${[...segs.slice(0, -1), base || last].join("/")}`;
    }
    return `${parsed.hostname}/${[...segs.slice(0, -1), base].join("/")}`;
  };

  const families = new Map<string, string[]>();
  for (const u of urls) {
    const key = familyKey(u);
    if (key === null) continue;
    if (!families.has(key)) families.set(key, []);
    families.get(key)!.push(u);
  }

  const drop = new Set<string>();
  for (const members of families.values()) {
    if (members.length < 3) continue;
    const keep = [...members].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0]!;
    for (const m of members) if (m !== keep) drop.add(m);
  }
  return urls.filter((u) => !drop.has(u));
}

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

  // Rule 3 evidence for a non-ISO prefix: 3+ URLs under it, or at least
  // one tail that also exists unprefixed. Sparse slugs like a lone
  // /ai/marketing never qualify.
  const nonIsoQualifies = (tails: Set<string>): boolean => {
    let overlap = 0;
    for (const t of tails) if (unprefixedTails.has(t)) overlap++;
    return overlap >= 1 || tails.size >= 3;
  };

  // Rule 1: 2+ distinct 2-letter prefixes AND at least one is ISO ->
  // treat every ISO prefix in the set as a language. Non-ISO prefixes
  // that just happened to co-occur (e.g. /ai/, /qa/) are NOT flagged on
  // co-occurrence alone — but they ARE still checked against Rule 3.
  // REGRESSION (annadentalclinic.com): the site localizes under /dk/
  // (country code; Danish is ISO "da") next to /en/, /sv/. The old early
  // return flagged only the ISO set, so the whole Danish namespace
  // leaked into the scrape candidates.
  if (prefixes.length >= 2 && isoPrefixes.length >= 1) {
    const detected = new Set(isoPrefixes);
    for (const [prefix, tails] of prefixToTails) {
      if (!detected.has(prefix) && nonIsoQualifies(tails)) detected.add(prefix);
    }
    return detected;
  }

  // Rule 2 + 3: singleton handling.
  const detected = new Set<string>();
  for (const [prefix, tails] of prefixToTails) {
    if (KNOWN_ISO_LANGS.has(prefix)) {
      // Rule 2: ISO singleton is enough on its own.
      detected.add(prefix);
    } else if (nonIsoQualifies(tails)) {
      // Rule 3: non-ISO singleton needs hard evidence.
      detected.add(prefix);
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
export function dedupeByLanguage(
  urls: string[],
  primaryLang: string = PRIMARY_LANG,
): {
  kept: string[];
  dropped: string[];
  detectedPrefixes: string[];
} {
  const detected = detectLanguagePrefixes(urls);
  const dropPrefixes = new Set<string>();
  for (const p of detected) if (p !== primaryLang) dropPrefixes.add(p);

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
export function filterCandidates(
  urls: string[],
  primaryLang: string = PRIMARY_LANG,
): FilterCandidatesResult {
  const afterJunk: string[] = [];
  const droppedJunk: string[] = [];
  for (const u of urls) {
    if (shouldScrape(u)) afterJunk.push(u);
    else droppedJunk.push(u);
  }
  const { kept, dropped, detectedPrefixes } = dedupeByLanguage(afterJunk, primaryLang);
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

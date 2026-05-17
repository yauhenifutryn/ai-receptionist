/**
 * Heuristic URL filter — drops obvious junk before Firecrawl scrape so we
 * don't burn credits on blog archives, cookie pages, sitemaps, etc.
 *
 * Conservative: only excludes paths we're highly confident never contain
 * receptionist-relevant info (services, prices, hours, staff, FAQ, contact).
 *
 * Path-segment matching, not substring — so "/career" excludes
 * `/career` and `/career/anything` but NOT `/career-day-summit`.
 */

const BLOCKED_SEGMENTS: ReadonlySet<string> = new Set([
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
  "polityka-prywatnosci",
  "polityka-prywatności",
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
  "wp-json",
  "wp-admin",
  "wp-content",
  "wp-includes",
  "login",
  "logowanie",
  "register",
  "rejestracja",
  "checkout",
  "koszyk",
  "cart",
]);

const BLOCKED_REGEX: ReadonlyArray<RegExp> = [
  /\/page\/\d+/i,
  /\/\d{4}\/\d{2}\//,
  /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|wav)$/i,
];

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
    if (BLOCKED_SEGMENTS.has(seg)) return false;
  }
  const lower = url.toLowerCase();
  for (const re of BLOCKED_REGEX) {
    if (re.test(lower)) return false;
  }
  return true;
}

/**
 * Default search query used when running Firecrawl `map` for a generic
 * receptionist scrape. Polish-first, covers the canonical sections we expect
 * in the knowledge document. Tenants in different verticals can override.
 */
export const DEFAULT_RELEVANCE_QUERY =
  "kontakt godziny usługi cennik lekarze faq oferta zespół o nas about services pricing contact hours team";

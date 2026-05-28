import type { FirecrawlPage } from "./firecrawl.js";
import { canonicalizeUrl } from "./url-filter.js";

/**
 * Extract internal links from already-scraped page markdown so the
 * pipeline can do a second discovery pass — finding URLs Firecrawl's
 * `/map` missed (often the canonical /cennik pages on sites where the
 * sitemap is incomplete).
 *
 * Strategy: parse standard markdown link syntax `[text](url)`. Keep
 * only same-origin absolute URLs (www and apex variants of the same
 * apex domain count as same-origin — clinic sites universally alias
 * www to apex). Return links as canonicalized URLs so callers can
 * compare against an already-canonicalized seenUrls set without
 * double-scraping the same logical page.
 */

const MARKDOWN_LINK_RE = /\[(?:[^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function apexHost(host: string): string {
  const lower = host.toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

export function extractInternalLinks(pages: FirecrawlPage[], rootUrl: string): string[] {
  let rootApex: string;
  try {
    rootApex = apexHost(new URL(rootUrl).hostname);
  } catch {
    return [];
  }

  const found = new Set<string>();
  for (const page of pages) {
    if (!page.markdown) continue;
    for (const match of page.markdown.matchAll(MARKDOWN_LINK_RE)) {
      const rawUrl = match[1];
      if (!rawUrl) continue;
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        continue;
      }
      // Same apex-host only (treats www and non-www as identical).
      if (apexHost(parsed.hostname) !== rootApex) continue;
      const canonical = canonicalizeUrl(rawUrl);
      if (canonical) found.add(canonical);
    }
  }
  return Array.from(found);
}

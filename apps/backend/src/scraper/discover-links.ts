import type { FirecrawlPage } from "./firecrawl.js";

/**
 * Extract internal links from already-scraped page markdown so the
 * pipeline can do a second discovery pass — finding URLs Firecrawl's
 * `/map` missed (often the canonical /cennik pages on sites where the
 * sitemap is incomplete).
 *
 * Strategy: parse standard markdown link syntax `[text](url)`. Keep
 * only same-origin absolute URLs. Strip fragments and query strings
 * for deduplication. Universal — no per-site rules.
 */

const MARKDOWN_LINK_RE = /\[(?:[^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

export function extractInternalLinks(
  pages: FirecrawlPage[],
  rootUrl: string,
): string[] {
  let rootHost: string;
  try {
    rootHost = new URL(rootUrl).hostname;
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
      // Same origin only
      if (parsed.hostname !== rootHost) continue;
      // Normalize: drop fragment + query, keep pathname only
      const normalized = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
      if (normalized === parsed.origin) {
        found.add(parsed.origin);
      } else {
        found.add(normalized);
      }
    }
  }
  return Array.from(found);
}

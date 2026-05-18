export interface FirecrawlPage {
  url: string;
  markdown: string;
}

export interface MapOptions {
  /** Firecrawl ranks returned URLs by relevance to this query. Free-text. */
  search?: string;
  /** Cap on URLs returned by Firecrawl (their default 5000, max 100000). */
  limit?: number;
  /** Include subdomains in the map. Firecrawl default true. */
  includeSubdomains?: boolean;
}

export interface FirecrawlClient {
  map(url: string, opts?: MapOptions): Promise<string[]>;
  scrape(url: string): Promise<FirecrawlPage>;
}

export interface CreateFirecrawlClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.firecrawl.dev";

/**
 * Universal client-side script Firecrawl runs after page hydration to
 * reveal content hidden behind clickable accordions / collapsibles.
 * Covers the patterns we've seen on real Polish clinic sites (most
 * Bootstrap / WordPress / vanilla HTML5 sites in 2024-2026).
 * Wrapped in a try/catch so a malformed selector on one site can't
 * abort the whole scrape.
 */
const ACCORDION_REVEAL_SCRIPT = `
(function() {
  try {
    // HTML5 <details> elements (vanilla + Bootstrap 5)
    document.querySelectorAll('details:not([open])').forEach(function(e){ e.open = true; });

    // ARIA-collapsed elements — click them to dispatch framework handlers
    document.querySelectorAll('[aria-expanded="false"]').forEach(function(e){
      try { e.click(); } catch (err) {}
    });

    // Bootstrap collapse and common toggle patterns
    document.querySelectorAll(
      '.accordion-header, .accordion-toggle, .accordion-button, ' +
      '.collapsible-header, .collapse-toggle, ' +
      '[data-toggle="collapse"], [data-bs-toggle="collapse"], ' +
      '.faq-question, .price-toggle, .toggle, .expandable-header'
    ).forEach(function(e){
      try { e.click(); } catch (err) {}
    });

    // Force-display Bootstrap-style hidden collapse panels in case
    // their JS handlers haven't fired
    document.querySelectorAll('.collapse:not(.show), .accordion-content, .panel-collapse').forEach(function(e){
      e.style.display = 'block';
      e.style.height = 'auto';
      e.classList.add('show');
    });

    // ARIA-controlled regions whose 'hidden' attribute is set
    document.querySelectorAll('[aria-hidden="true"][role="region"]').forEach(function(e){
      e.removeAttribute('hidden');
      e.setAttribute('aria-hidden', 'false');
    });
  } catch (err) { /* swallow — never abort the scrape */ }
})();
`.trim();

export function createFirecrawlClient(
  opts: CreateFirecrawlClientOptions = {},
): FirecrawlClient {
  const apiKey = opts.apiKey ?? process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("createFirecrawlClient: FIRECRAWL_API_KEY missing");
  }
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetcher ?? fetch;

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Firecrawl ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  return {
    async map(url: string, opts: MapOptions = {}): Promise<string[]> {
      const body = await post<{ success?: boolean; links?: string[] }>(
        "/v1/map",
        {
          url,
          ...(opts.search !== undefined ? { search: opts.search } : {}),
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(opts.includeSubdomains !== undefined
            ? { includeSubdomains: opts.includeSubdomains }
            : {}),
        },
      );
      return body.links ?? [];
    },

    async scrape(url: string): Promise<FirecrawlPage> {
      // Universal accordion / dropdown handler — runs on every scrape
      // with zero per-site config. Reveals content hidden behind:
      //   - HTML5 <details> elements (plain HTML, Bootstrap 5)
      //   - ARIA aria-expanded="false" (most modern frameworks)
      //   - Bootstrap collapse (data-toggle / data-bs-toggle)
      //   - WordPress accordion plugins (common class patterns)
      //   - Generic .collapse / .accordion-content hidden via display:none
      // This was added after dynastystomatology.pl's /cennik dropped 100%
      // of prices behind clickable accordions — static scraping caught
      // only headers, prices lived behind clicks.
      const body = await post<{
        success?: boolean;
        data?: { markdown?: string; metadata?: { sourceURL?: string } };
      }>("/v1/scrape", {
        url,
        formats: ["markdown"],
        actions: [
          { type: "wait", milliseconds: 2000 },
          {
            type: "executeJavascript",
            script: ACCORDION_REVEAL_SCRIPT,
          },
          { type: "wait", milliseconds: 1500 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 800 },
        ],
      });
      return {
        url: body.data?.metadata?.sourceURL ?? url,
        markdown: body.data?.markdown ?? "",
      };
    },
  };
}

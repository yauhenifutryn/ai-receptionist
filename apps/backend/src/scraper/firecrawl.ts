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
      const body = await post<{
        success?: boolean;
        data?: { markdown?: string; metadata?: { sourceURL?: string } };
      }>("/v1/scrape", { url, formats: ["markdown"] });
      return {
        url: body.data?.metadata?.sourceURL ?? url,
        markdown: body.data?.markdown ?? "",
      };
    },
  };
}

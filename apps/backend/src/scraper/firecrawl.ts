export interface FirecrawlPage {
  url: string;
  markdown: string;
}

export interface FirecrawlClient {
  map(url: string): Promise<string[]>;
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
    async map(url: string): Promise<string[]> {
      const body = await post<{ success?: boolean; links?: string[] }>("/v1/map", {
        url,
      });
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

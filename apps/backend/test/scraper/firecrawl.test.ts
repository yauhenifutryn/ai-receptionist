import { describe, it, expect, vi } from "vitest";
import { createFirecrawlClient } from "../../src/scraper/firecrawl.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("FirecrawlClient (W2.1)", () => {
  it("map() POSTs to /v1/map with bearer auth and returns URL list", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, links: ["https://x/a", "https://x/b"] }),
    );
    const client = createFirecrawlClient({ apiKey: "fc-test", fetcher });
    const urls = await client.map("https://x");
    expect(urls).toEqual(["https://x/a", "https://x/b"]);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/map");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fc-test",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({ url: "https://x" });
  });

  it("scrape() POSTs to /v1/scrape and returns url+markdown", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { markdown: "# hello", metadata: { sourceURL: "https://x/a" } },
      }),
    );
    const client = createFirecrawlClient({ apiKey: "fc-test", fetcher });
    const page = await client.scrape("https://x/a");
    expect(page.markdown).toBe("# hello");
    expect(page.url).toBe("https://x/a");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/scrape");
    expect(JSON.parse(init.body as string)).toMatchObject({
      url: "https://x/a",
      formats: ["markdown"],
    });
  });

  it("throws structured error on non-2xx response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("rate-limited", { status: 429 }),
    );
    const client = createFirecrawlClient({ apiKey: "fc-test", fetcher });
    await expect(client.map("https://x")).rejects.toThrow(/429/);
  });

  it("throws when apiKey is not provided and no env var", () => {
    const orig = process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
    try {
      expect(() => createFirecrawlClient({})).toThrow(/FIRECRAWL_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.FIRECRAWL_API_KEY = orig;
    }
  });
});

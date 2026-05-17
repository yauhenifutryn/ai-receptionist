import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "../../src/lib/llm.js";
import { pickByScore, rerankUrls, type RerankItem } from "../../src/scraper/llm-reranker.js";

describe("pickByScore (dynamic cap)", () => {
  const mk = (entries: Array<[string, number]>): RerankItem[] =>
    entries.map(([url, score]) => ({ url, score, reason: "" }));

  it("keeps all URLs above threshold", () => {
    const out = pickByScore(
      mk([["/a", 0.9], ["/b", 0.8], ["/c", 0.7]]),
      { threshold: 0.5, floor: 2, ceiling: 30 },
    );
    expect(out).toEqual(["/a", "/b", "/c"]);
  });

  it("falls back to floor when too few are above threshold", () => {
    const out = pickByScore(
      mk([["/a", 0.9], ["/b", 0.3], ["/c", 0.2], ["/d", 0.1]]),
      { threshold: 0.5, floor: 3, ceiling: 30 },
    );
    expect(out).toEqual(["/a", "/b", "/c"]);
  });

  it("caps at ceiling even when many URLs pass threshold", () => {
    const items = mk(Array.from({ length: 50 }, (_, i) => [`/u${i}`, 0.9] as [string, number]));
    const out = pickByScore(items, { threshold: 0.5, floor: 8, ceiling: 15 });
    expect(out).toHaveLength(15);
  });

  it("returns empty for empty input", () => {
    expect(pickByScore([], {})).toEqual([]);
  });

  it("floor cannot exceed list size", () => {
    const out = pickByScore(mk([["/a", 0.1]]), { threshold: 0.9, floor: 10, ceiling: 30 });
    expect(out).toEqual(["/a"]);
  });

  it("default opts give reasonable behavior", () => {
    const items = mk([
      ["/a", 0.95],
      ["/b", 0.7],
      ["/c", 0.6],
      ["/d", 0.3],
      ["/e", 0.1],
    ]);
    const out = pickByScore(items);
    // threshold=0.5: a, b, c qualify -> 3 picks. Floor=8 -> top up to 8 -> all 5.
    expect(out).toEqual(["/a", "/b", "/c", "/d", "/e"]);
  });
});

describe("rerankUrls (LLM call)", () => {
  it("returns scored URLs sorted desc, preserving every input", async () => {
    const fakeProvider = {
      generateJson: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ranked: [
            { url: "https://x.pl/cennik", score: 0.95, reason: "prices" },
            { url: "https://x.pl/", score: 0.7, reason: "home" },
            { url: "https://x.pl/blog/post", score: 0.05, reason: "blog" },
          ],
        }),
      }),
    };
    const llm = new LLMClient(fakeProvider);
    const out = await rerankUrls({
      rootUrl: "https://x.pl",
      urls: ["https://x.pl/", "https://x.pl/cennik", "https://x.pl/blog/post"],
      llm,
    });
    expect(out.map((r) => r.url)).toEqual([
      "https://x.pl/cennik",
      "https://x.pl/",
      "https://x.pl/blog/post",
    ]);
    expect(out[0]!.score).toBe(0.95);
  });

  it("inserts neutral score for URLs the model omitted", async () => {
    const fakeProvider = {
      generateJson: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ranked: [{ url: "https://x.pl/cennik", score: 0.9, reason: "" }],
        }),
      }),
    };
    const llm = new LLMClient(fakeProvider);
    const out = await rerankUrls({
      rootUrl: "https://x.pl",
      urls: ["https://x.pl/cennik", "https://x.pl/uslugi"],
      llm,
    });
    expect(out).toHaveLength(2);
    const uslugi = out.find((r) => r.url === "https://x.pl/uslugi")!;
    expect(uslugi.score).toBe(0.5);
    expect(uslugi.reason).toMatch(/neutral/);
  });

  it("returns [] for empty input without calling LLM", async () => {
    const provider = { generateJson: vi.fn() };
    const llm = new LLMClient(provider);
    const out = await rerankUrls({ rootUrl: "https://x.pl", urls: [], llm });
    expect(out).toEqual([]);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });
});

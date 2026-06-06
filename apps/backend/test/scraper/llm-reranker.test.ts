import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "../../src/lib/llm.js";
import { pickByScore, rerankUrls, type RerankItem } from "../../src/scraper/llm-reranker.js";

describe("pickByScore (dynamic cap)", () => {
  const mk = (entries: Array<[string, number]>): RerankItem[] =>
    entries.map(([url, score]) => ({ url, score, reason: "" }));

  it("keeps all URLs above threshold", () => {
    const out = pickByScore(
      mk([
        ["/a", 0.9],
        ["/b", 0.8],
        ["/c", 0.7],
      ]),
      { threshold: 0.5, floor: 2, ceiling: 30 },
    );
    expect(out).toEqual(["/a", "/b", "/c"]);
  });

  it("falls back to floor when too few are above threshold", () => {
    const out = pickByScore(
      mk([
        ["/a", 0.9],
        ["/b", 0.3],
        ["/c", 0.2],
        ["/d", 0.1],
      ]),
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

  it("scores omitted URLs at 0 so they fall below any reasonable threshold", async () => {
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
    expect(uslugi.score).toBe(0);
    expect(uslugi.reason).toMatch(/omitted/);
  });

  it("omitted URLs do not jump above scored-bad URLs (F5 regression)", async () => {
    const fakeProvider = {
      generateJson: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ranked: [
            { url: "https://x.pl/cennik", score: 0.9, reason: "" },
            { url: "https://x.pl/blog", score: 0.4, reason: "bad" },
          ],
        }),
      }),
    };
    const llm = new LLMClient(fakeProvider);
    const out = await rerankUrls({
      rootUrl: "https://x.pl",
      urls: ["https://x.pl/cennik", "https://x.pl/blog", "https://x.pl/mystery"],
      llm,
    });
    // Sorted desc: cennik (0.9), blog (0.4), mystery (0.0)
    expect(out.map((r) => r.url)).toEqual([
      "https://x.pl/cennik",
      "https://x.pl/blog",
      "https://x.pl/mystery",
    ]);
  });

  it("returns [] for empty input without calling LLM", async () => {
    const provider = { generateJson: vi.fn() };
    const llm = new LLMClient(provider);
    const out = await rerankUrls({ rootUrl: "https://x.pl", urls: [], llm });
    expect(out).toEqual([]);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });
});

describe("rerankUrls (chunking — REGRESSION dentus.szczecin.pl 620 kept URLs)", () => {
  // A single call caps at ~100 scored entries (8192 output tokens). Large
  // sites must be reranked in FULL via parallel chunked calls — slicing
  // the input to the first 100 URLs made page selection depend on
  // Firecrawl's unstable map order (13 vs 2 priced services across runs),
  // and the depth-sort workaround crowded the input with campaign stubs.
  it("splits >100-URL inputs into multiple LLM calls and merges all scores", async () => {
    const calls: string[][] = [];
    const fakeProvider = {
      generateJson: vi.fn().mockImplementation(async (args: { user: string }) => {
        const urls = args.user
          .split("\n")
          .filter((l) => /^\d+\. /.test(l))
          .map((l) => l.replace(/^\d+\. /, ""));
        calls.push(urls);
        return {
          text: JSON.stringify({
            ranked: urls.map((u) => ({
              url: u,
              score: u.includes("cennik") ? 0.95 : 0.5,
              reason: "",
            })),
          }),
        };
      }),
    };
    const llm = new LLMClient(fakeProvider);
    const urls = [
      ...Array.from({ length: 150 }, (_, i) => `https://x.pl/page-${String(i).padStart(3, "0")}`),
      "https://x.pl/zzz-cennik", // would be cut by any first-100 slice
    ];
    const out = await rerankUrls({ rootUrl: "https://x.pl", urls, llm });

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every((c) => c.length <= 100)).toBe(true);
    expect(out).toHaveLength(151);
    expect(out[0]!.url).toBe("https://x.pl/zzz-cennik");
    expect(out[0]!.score).toBe(0.95);
  });
});

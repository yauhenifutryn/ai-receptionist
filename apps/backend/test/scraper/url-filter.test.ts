import { describe, it, expect } from "vitest";
import {
  shouldScrape,
  DEFAULT_RELEVANCE_QUERY,
  detectLanguagePrefixes,
  dedupeByLanguage,
  detectPrimaryLanguage,
  filterCandidates,
} from "../../src/scraper/url-filter.js";

/**
 * Philosophy: shouldScrape drops ONLY mechanical noise (binary files,
 * CMS admin endpoints, paginated/date duplicates). All content-shape
 * decisions ("is this blog page useful?") are delegated to the LLM
 * rerank step that runs after this filter.
 */
describe("shouldScrape (mechanical-noise only)", () => {
  it("keeps canonical receptionist pages", () => {
    expect(shouldScrape("https://klinika.pl/")).toBe(true);
    expect(shouldScrape("https://klinika.pl/o-nas")).toBe(true);
    expect(shouldScrape("https://klinika.pl/uslugi")).toBe(true);
    expect(shouldScrape("https://klinika.pl/cennik")).toBe(true);
    expect(shouldScrape("https://klinika.pl/zespol")).toBe(true);
    expect(shouldScrape("https://klinika.pl/kontakt")).toBe(true);
    expect(shouldScrape("https://klinika.pl/faq")).toBe(true);
    expect(shouldScrape("https://klinika.pl/godziny-otwarcia")).toBe(true);
  });

  it("REGRESSION: keeps /service-category/<slug> with prices", () => {
    // The dental site's service detail pages live under /service-category/*.
    // Previous heuristic killed these because "category" was word-blocked.
    expect(shouldScrape("https://klinika.pl/service-category/stomatologia-zachowawcza")).toBe(true);
    expect(shouldScrape("https://klinika.pl/service-category/implantologia")).toBe(true);
    expect(shouldScrape("https://klinika.pl/service-category/wybielanie-zebow")).toBe(true);
  });

  it("delegates content judgments to the LLM rerank — does NOT pre-filter blog/news/legal/career", () => {
    // These used to be heuristically dropped. New philosophy: pass through
    // and let the Flash Lite reranker score them. Cheaper than guessing
    // wrong; safer than missing the pricing page hiding behind a "blog"
    // slug.
    expect(shouldScrape("https://klinika.pl/blog/post-1")).toBe(true);
    expect(shouldScrape("https://klinika.pl/news/2024-update")).toBe(true);
    expect(shouldScrape("https://klinika.pl/privacy-policy")).toBe(true);
    expect(shouldScrape("https://klinika.pl/cookies")).toBe(true);
    expect(shouldScrape("https://klinika.pl/regulamin")).toBe(true);
    expect(shouldScrape("https://klinika.pl/terms-and-conditions")).toBe(true);
    expect(shouldScrape("https://klinika.pl/category/news")).toBe(true);
    expect(shouldScrape("https://klinika.pl/career")).toBe(true);
    expect(shouldScrape("https://klinika.pl/tag/promo")).toBe(true);
    expect(shouldScrape("https://klinika.pl/author/jan-kowalski")).toBe(true);
  });

  it("drops CMS admin endpoints (mechanical — these never render user pages)", () => {
    expect(shouldScrape("https://klinika.pl/wp-admin/post.php")).toBe(false);
    expect(shouldScrape("https://klinika.pl/wp-json/wp/v2/posts")).toBe(false);
    expect(shouldScrape("https://klinika.pl/wp-content/uploads/x.png")).toBe(false);
    expect(shouldScrape("https://klinika.pl/wp-includes/script.js")).toBe(false);
  });

  it("drops paginated archives (mechanical — duplicate content of page 1)", () => {
    expect(shouldScrape("https://klinika.pl/page/2")).toBe(false);
    expect(shouldScrape("https://klinika.pl/page/12")).toBe(false);
  });

  it("drops date-shaped archives (mechanical — duplicate of canonical post)", () => {
    expect(shouldScrape("https://klinika.pl/2023/04/post-title")).toBe(false);
    expect(shouldScrape("https://klinika.pl/2024/12/")).toBe(false);
  });

  it("drops binary / non-html files (mechanical — scraper can't markdownify)", () => {
    expect(shouldScrape("https://klinika.pl/cennik.pdf")).toBe(false);
    expect(shouldScrape("https://klinika.pl/photo.jpg")).toBe(false);
    expect(shouldScrape("https://klinika.pl/video.mp4")).toBe(false);
    expect(shouldScrape("https://klinika.pl/icon.svg")).toBe(false);
    expect(shouldScrape("https://klinika.pl/font.woff2")).toBe(false);
    expect(shouldScrape("https://klinika.pl/styles.css")).toBe(false);
    expect(shouldScrape("https://klinika.pl/script.js")).toBe(false);
  });

  it("drops sitemap / feed / json (mechanical — returns XML or JSON)", () => {
    expect(shouldScrape("https://klinika.pl/sitemap.xml")).toBe(false);
    expect(shouldScrape("https://klinika.pl/post-sitemap.xml")).toBe(false);
    expect(shouldScrape("https://klinika.pl/feed.rss")).toBe(false);
    expect(shouldScrape("https://klinika.pl/api.json")).toBe(false);
  });

  it("DEFAULT_RELEVANCE_QUERY covers Polish receptionist keywords", () => {
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/cennik/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/usługi/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/kontakt/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/lekarze/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/faq/);
  });
});

describe("detectLanguagePrefixes (semantic, ISO-gated)", () => {
  it("detects /en/ /uk/ /ru/ when each has tail overlap with unprefixed", () => {
    const urls = [
      "https://klinika.pl/doctors/x",
      "https://klinika.pl/en/doctors/x",
      "https://klinika.pl/uk/doctors/x",
      "https://klinika.pl/ru/doctors/x",
    ];
    const detected = detectLanguagePrefixes(urls);
    expect(detected.has("en")).toBe(true);
    expect(detected.has("uk")).toBe(true);
    expect(detected.has("ru")).toBe(true);
  });

  it("detects a language with 3+ URLs even without unprefixed overlap", () => {
    const urls = ["https://klinika.pl/en/a", "https://klinika.pl/en/b", "https://klinika.pl/en/c"];
    expect(detectLanguagePrefixes(urls).has("en")).toBe(true);
  });

  it("does not flag a 2-letter slug that is just a single page (e.g. /ai)", () => {
    const urls = [
      "https://klinika.pl/uslugi",
      "https://klinika.pl/ai",
      "https://klinika.pl/kontakt",
    ];
    expect(detectLanguagePrefixes(urls).has("ai")).toBe(false);
  });

  it("F8: does not flag two non-ISO 2-letter slugs that just co-occur (/ai/ + /qa/)", () => {
    const urls = [
      "https://klinika.pl/ai/marketing",
      "https://klinika.pl/qa/quality",
      "https://klinika.pl/uslugi",
    ];
    const detected = detectLanguagePrefixes(urls);
    expect(detected.has("ai")).toBe(false);
    expect(detected.has("qa")).toBe(false);
  });

  it("F8: mixed ISO + non-ISO co-occurrence — only ISO is flagged", () => {
    const urls = [
      "https://klinika.pl/en/contact",
      "https://klinika.pl/ai/marketing",
      "https://klinika.pl/uslugi",
    ];
    const detected = detectLanguagePrefixes(urls);
    expect(detected.has("en")).toBe(true);
    expect(detected.has("ai")).toBe(false);
  });

  it("F9: ISO singleton with transliterated tail is detected (no overlap needed)", () => {
    const urls = ["https://klinika.pl/doctors/oleh-vus", "https://klinika.pl/en/doctors/oleg-vus"];
    expect(detectLanguagePrefixes(urls).has("en")).toBe(true);
  });
});

describe("dedupeByLanguage (drop non-Polish translations)", () => {
  it("drops /en/ /uk/ /ru/ when Polish version exists, keeps unprefixed", () => {
    const urls = [
      "https://klinika.pl/doctors/x",
      "https://klinika.pl/en/doctors/x",
      "https://klinika.pl/uk/doctors/x",
      "https://klinika.pl/ru/doctors/x",
    ];
    const result = dedupeByLanguage(urls);
    expect(result.kept).toEqual(["https://klinika.pl/doctors/x"]);
    expect(result.dropped).toHaveLength(3);
    expect(result.detectedPrefixes.sort()).toEqual(["en", "ru", "uk"]);
  });

  it("keeps Polish-prefixed URLs (/pl/...)", () => {
    const urls = [
      "https://klinika.pl/pl/doctors/x",
      "https://klinika.pl/en/doctors/x",
      "https://klinika.pl/uk/doctors/x",
    ];
    const result = dedupeByLanguage(urls);
    expect(result.kept).toContain("https://klinika.pl/pl/doctors/x");
    expect(result.kept).not.toContain("https://klinika.pl/en/doctors/x");
  });

  it("preserves single-language sites (no false positives)", () => {
    const urls = [
      "https://klinika.pl/uslugi",
      "https://klinika.pl/cennik",
      "https://klinika.pl/kontakt",
    ];
    const result = dedupeByLanguage(urls);
    expect(result.kept).toEqual(urls);
    expect(result.dropped).toHaveLength(0);
  });

  it("keeps /en/ paths when primaryLang='en' (EN-primary site)", () => {
    const urls = [
      "https://indexmedica.com/en/treatments",
      "https://indexmedica.com/en/prices",
      "https://indexmedica.com/pl/leczenie",
      "https://indexmedica.com/de/behandlung",
    ];
    const { kept, dropped } = dedupeByLanguage(urls, "en");
    expect(kept).toEqual([
      "https://indexmedica.com/en/treatments",
      "https://indexmedica.com/en/prices",
    ]);
    expect(dropped).toEqual([
      "https://indexmedica.com/pl/leczenie",
      "https://indexmedica.com/de/behandlung",
    ]);
  });

  it("defaults primaryLang to 'pl' when arg omitted (back-compat)", () => {
    const urls = ["https://klinika.pl/uslugi", "https://klinika.pl/en/services"];
    const { kept } = dedupeByLanguage(urls);
    expect(kept).toContain("https://klinika.pl/uslugi");
    expect(kept).not.toContain("https://klinika.pl/en/services");
  });
});

describe("filterCandidates (top-level)", () => {
  it("end-to-end on the dynastystomatology.pl regression set", () => {
    const urls = [
      "https://dynastystomatology.pl/uk/doctors/oleg-vus",
      "https://dynastystomatology.pl/en/doctors/oleh-vus",
      "https://dynastystomatology.pl/ru/doctors/oleg-vus",
      "https://dynastystomatology.pl/doctors/oleg-vus",
      "https://dynastystomatology.pl/service-category/implantologia",
      "https://dynastystomatology.pl/service-category/wybielanie-zebow",
      "https://dynastystomatology.pl/najlepsze-opcje-wybielania-zebow",
      "https://dynastystomatology.pl/sitemap.xml",
      "https://dynastystomatology.pl/wp-admin/index.php",
    ];
    const r = filterCandidates(urls);
    // service-category pages with prices MUST survive.
    expect(r.kept).toContain("https://dynastystomatology.pl/service-category/implantologia");
    expect(r.kept).toContain("https://dynastystomatology.pl/service-category/wybielanie-zebow");
    // Polish unprefixed doctor page survives, translations dropped.
    expect(r.kept).toContain("https://dynastystomatology.pl/doctors/oleg-vus");
    expect(r.kept.some((u) => u.includes("/en/") || u.includes("/uk/") || u.includes("/ru/"))).toBe(
      false,
    );
    // Mechanical noise dropped.
    expect(r.kept).not.toContain("https://dynastystomatology.pl/sitemap.xml");
    expect(r.kept).not.toContain("https://dynastystomatology.pl/wp-admin/index.php");
  });
});

describe("detectPrimaryLanguage (root-redirect signal)", () => {
  /**
   * Builds a fake fetch that returns a single response. Lets us inject
   * the exact redirect status + Location header per test without real
   * network calls.
   */
  function fakeFetch(status: number, location?: string): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      void input;
      const headers = new Headers();
      if (location !== undefined) headers.set("location", location);
      return new Response(null, { status, headers });
    }) as typeof fetch;
  }

  it("detects EN when root redirects to /en/", async () => {
    const f = fakeFetch(301, "/en/");
    expect(await detectPrimaryLanguage("https://indexmedica.com", f)).toBe("en");
  });

  it("detects PL when root redirects to /pl/wola", async () => {
    const f = fakeFetch(302, "/pl/wola");
    expect(await detectPrimaryLanguage("https://natadent.pl", f)).toBe("pl");
  });

  it("detects DE when redirect Location is an absolute URL", async () => {
    const f = fakeFetch(301, "https://klinik.de/de/start");
    expect(await detectPrimaryLanguage("https://klinik.de", f)).toBe("de");
  });

  it("returns null when root responds 200 with no redirect", async () => {
    const f = fakeFetch(200);
    expect(await detectPrimaryLanguage("https://dynastystomatology.pl", f)).toBeNull();
  });

  it("returns null when redirect Location has no language prefix", async () => {
    const f = fakeFetch(301, "/home");
    expect(await detectPrimaryLanguage("https://klinika.pl", f)).toBeNull();
  });

  it("returns null when redirect prefix is a 2-letter slug but not a known ISO lang", async () => {
    // /ai/ is not a language. Don't misclassify.
    const f = fakeFetch(301, "/ai/");
    expect(await detectPrimaryLanguage("https://klinika.pl", f)).toBeNull();
  });

  it("returns null on fetch failure (network error / timeout)", async () => {
    const f = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await detectPrimaryLanguage("https://klinika.pl", f)).toBeNull();
  });

  it("normalizes uppercase Location prefixes to lowercase", async () => {
    const f = fakeFetch(301, "/EN/about");
    expect(await detectPrimaryLanguage("https://example.com", f)).toBe("en");
  });
});

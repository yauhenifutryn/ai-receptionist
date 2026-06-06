import { describe, it, expect } from "vitest";
import {
  canonicalizeUrl,
  collapseUrlFamilies,
  shouldScrape,
  DEFAULT_RELEVANCE_QUERY,
  detectLanguagePrefixes,
  dedupeByLanguage,
  dedupeByCanonicalUrl,
  detectPrimaryLanguage,
  filterCandidates,
  upgradeToRootScheme,
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

  it("REGRESSION annadentalclinic.com: flags a non-ISO prefix with 3+ URLs even when ISO prefixes co-exist", () => {
    // The site uses /dk/ (country code — Danish is ISO "da") alongside
    // /en/, /sv/. Rule 1's early return flagged only the ISO set, so the
    // whole Danish namespace leaked into scrape candidates (7 of the
    // top-25 slots on the real site). Rule 3 (multiplicity/overlap) must
    // still be evaluated for non-ISO prefixes when Rule 1 triggers.
    const urls = [
      "https://annadentalclinic.com/o-nas",
      "https://annadentalclinic.com/en/about",
      "https://annadentalclinic.com/en/team",
      "https://annadentalclinic.com/sv/om-oss",
      "https://annadentalclinic.com/dk/om-os",
      "https://annadentalclinic.com/dk/tilbud",
      "https://annadentalclinic.com/dk/prisliste",
    ];
    const detected = detectLanguagePrefixes(urls);
    expect(detected.has("en")).toBe(true);
    expect(detected.has("sv")).toBe(true);
    expect(detected.has("dk")).toBe(true);
  });

  it("F8 guard holds: sparse non-ISO slug NOT flagged when ISO prefixes co-exist", () => {
    // /ai/ has one URL, no overlap with unprefixed tails — must survive
    // even though Rule 1 fires for /en/.
    const urls = [
      "https://klinika.pl/en/contact",
      "https://klinika.pl/en/about",
      "https://klinika.pl/ai/marketing",
      "https://klinika.pl/uslugi",
    ];
    const detected = detectLanguagePrefixes(urls);
    expect(detected.has("en")).toBe(true);
    expect(detected.has("ai")).toBe(false);
  });
});

describe("upgradeToRootScheme (REGRESSION dci.waw.pl: http links → Firecrawl 200 + proxy-error body)", () => {
  // Firecrawl's map returns http:// links for dci.waw.pl; scraping them
  // makes Firecrawl's upstream proxy fail and return a SUCCESSFUL scrape
  // whose markdown is literally "Invalid upstream proxy credentials".
  // 25 such pages consolidated into a 736-char KB. The https variant of
  // the same page returns 20K chars.
  it("rewrites same-host http links to https when the root is https", () => {
    const out = upgradeToRootScheme("https://dci.waw.pl", [
      "http://dci.waw.pl/price",
      "http://dci.waw.pl/about",
      "https://dci.waw.pl/pl",
    ]);
    expect(out).toEqual([
      "https://dci.waw.pl/price",
      "https://dci.waw.pl/about",
      "https://dci.waw.pl/pl",
    ]);
  });

  it("rewrites www-variant hosts of the same site", () => {
    const out = upgradeToRootScheme("https://dci.waw.pl", ["http://www.dci.waw.pl/price"]);
    expect(out).toEqual(["https://www.dci.waw.pl/price"]);
  });

  it("leaves links on other hosts untouched", () => {
    const out = upgradeToRootScheme("https://dci.waw.pl", ["http://other-site.pl/page"]);
    expect(out).toEqual(["http://other-site.pl/page"]);
  });

  it("is a no-op when the root itself is http", () => {
    const out = upgradeToRootScheme("http://legacy.pl", ["http://legacy.pl/cennik"]);
    expect(out).toEqual(["http://legacy.pl/cennik"]);
  });

  it("returns unparseable URLs unchanged", () => {
    const out = upgradeToRootScheme("https://dci.waw.pl", ["not a url"]);
    expect(out).toEqual(["not a url"]);
  });
});

describe("collapseUrlFamilies (REGRESSION dentus.szczecin.pl: template-stub families crowd out content)", () => {
  // dentus-kids-1..17, d_f-1/-5/-502, dentysci_stomatolodzy/_/_2 — same
  // template rendered N times. They tied with real service pages in the
  // rerank and won on alphabetical tie-break, producing a 0-priced KB.
  it("collapses families of 3+ URLs differing only by a trailing numeric/underscore suffix", () => {
    const out = collapseUrlFamilies([
      "https://x.pl/dentus-kids-1",
      "https://x.pl/dentus-kids-2",
      "https://x.pl/dentus-kids-10",
      "https://x.pl/dentus-kids-11",
      "https://x.pl/zakres-uslug/higienizacja",
    ]);
    expect(out.filter((u) => u.includes("dentus-kids"))).toHaveLength(1);
    expect(out).toContain("https://x.pl/zakres-uslug/higienizacja");
  });

  it("collapses underscore-suffix families", () => {
    const out = collapseUrlFamilies([
      "https://x.pl/dentysci_stomatolodzy",
      "https://x.pl/dentysci_stomatolodzy_",
      "https://x.pl/dentysci_stomatolodzy_2",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("https://x.pl/dentysci_stomatolodzy");
  });

  it("keeps families with fewer than 3 members (could be real pages)", () => {
    const out = collapseUrlFamilies(["https://x.pl/ortodoncja", "https://x.pl/ortodoncja-2"]);
    expect(out).toHaveLength(2);
  });

  it("keeps distinct service pages untouched", () => {
    const urls = [
      "https://x.pl/zakres-uslug/implanty",
      "https://x.pl/zakres-uslug/protezy",
      "https://x.pl/zakres-uslug/sedacja",
    ];
    expect(collapseUrlFamilies(urls)).toEqual(urls);
  });
});

describe("dedupeByCanonicalUrl (collapse www/naked + trailing-slash variants)", () => {
  it("keeps the first occurrence of each canonical URL", () => {
    const out = dedupeByCanonicalUrl([
      "https://dentus.szczecin.pl/kontakt",
      "https://www.dentus.szczecin.pl/kontakt",
      "https://www.dentus.szczecin.pl/kontakt/",
      "https://www.dentus.szczecin.pl/zespol",
    ]);
    expect(out).toEqual([
      "https://dentus.szczecin.pl/kontakt",
      "https://www.dentus.szczecin.pl/zespol",
    ]);
  });

  it("keeps distinct paths and unparseable URLs", () => {
    const out = dedupeByCanonicalUrl(["https://x.pl/a", "https://x.pl/b", "junk"]);
    expect(out).toEqual(["https://x.pl/a", "https://x.pl/b", "junk"]);
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

  it("threads primaryLang through to dedupeByLanguage (EN-primary site)", () => {
    const urls = [
      "https://indexmedica.com/en/treatments",
      "https://indexmedica.com/en/prices",
      "https://indexmedica.com/pl/leczenie",
    ];
    const result = filterCandidates(urls, "en");
    expect(result.kept).toEqual([
      "https://indexmedica.com/en/treatments",
      "https://indexmedica.com/en/prices",
    ]);
    expect(result.droppedTranslations).toEqual(["https://indexmedica.com/pl/leczenie"]);
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

describe("canonicalizeUrl (dedupe key for www/trailing-slash/query variants)", () => {
  it("strips www prefix and treats it equivalent to apex", () => {
    expect(canonicalizeUrl("https://www.example.com/x")).toBe("https://example.com/x");
    expect(canonicalizeUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("strips trailing slash from pathname", () => {
    expect(canonicalizeUrl("https://example.com/treatments/")).toBe(
      "https://example.com/treatments",
    );
  });

  it("keeps root pathname empty (no spurious slash)", () => {
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(canonicalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("drops query string and fragment", () => {
    expect(canonicalizeUrl("https://example.com/x?q=1#hash")).toBe("https://example.com/x");
  });

  it("lowercases host but preserves pathname case", () => {
    expect(canonicalizeUrl("https://EXAMPLE.com/Treatments/X")).toBe(
      "https://example.com/Treatments/X",
    );
  });

  it("drops default ports (443 https / 80 http)", () => {
    expect(canonicalizeUrl("https://example.com:443/x")).toBe("https://example.com/x");
    expect(canonicalizeUrl("http://example.com:80/x")).toBe("http://example.com/x");
  });

  it("preserves non-default ports", () => {
    expect(canonicalizeUrl("https://example.com:8443/x")).toBe("https://example.com:8443/x");
  });

  it("returns null for unparseable input", () => {
    expect(canonicalizeUrl("not a url")).toBeNull();
    expect(canonicalizeUrl("")).toBeNull();
  });

  it("treats www and non-www of the same URL as identical after canonicalization", () => {
    expect(canonicalizeUrl("https://www.indexmedica.com/treatments/teeth-whitening/")).toBe(
      canonicalizeUrl("https://indexmedica.com/treatments/teeth-whitening"),
    );
  });
});

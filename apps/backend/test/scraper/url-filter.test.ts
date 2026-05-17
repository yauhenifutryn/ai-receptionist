import { describe, it, expect } from "vitest";
import {
  shouldScrape,
  DEFAULT_RELEVANCE_QUERY,
  detectLanguagePrefixes,
  dedupeByLanguage,
  filterCandidates,
} from "../../src/scraper/url-filter.js";

describe("url-filter (smart scraping)", () => {
  it("keeps canonical receptionist-relevant pages", () => {
    expect(shouldScrape("https://klinika.pl/")).toBe(true);
    expect(shouldScrape("https://klinika.pl/o-nas")).toBe(true);
    expect(shouldScrape("https://klinika.pl/uslugi")).toBe(true);
    expect(shouldScrape("https://klinika.pl/cennik")).toBe(true);
    expect(shouldScrape("https://klinika.pl/zespol")).toBe(true);
    expect(shouldScrape("https://klinika.pl/kontakt")).toBe(true);
    expect(shouldScrape("https://klinika.pl/faq")).toBe(true);
    expect(shouldScrape("https://klinika.pl/godziny-otwarcia")).toBe(true);
  });

  it("drops blog / news / aktualnosci archives", () => {
    expect(shouldScrape("https://klinika.pl/blog/")).toBe(false);
    expect(shouldScrape("https://klinika.pl/blog/2024/post-1")).toBe(false);
    expect(shouldScrape("https://klinika.pl/news/2024-update")).toBe(false);
    expect(shouldScrape("https://klinika.pl/aktualnosci/wiadomosc")).toBe(false);
  });

  it("drops legal boilerplate (privacy, terms, cookies)", () => {
    expect(shouldScrape("https://klinika.pl/privacy")).toBe(false);
    expect(shouldScrape("https://klinika.pl/polityka-prywatnosci")).toBe(false);
    expect(shouldScrape("https://klinika.pl/terms")).toBe(false);
    expect(shouldScrape("https://klinika.pl/regulamin")).toBe(false);
    expect(shouldScrape("https://klinika.pl/cookies")).toBe(false);
  });

  it("drops WordPress admin / json / paginated archives", () => {
    expect(shouldScrape("https://klinika.pl/wp-admin/post.php")).toBe(false);
    expect(shouldScrape("https://klinika.pl/wp-json/wp/v2/posts")).toBe(false);
    expect(shouldScrape("https://klinika.pl/page/2")).toBe(false);
    expect(shouldScrape("https://klinika.pl/page/12")).toBe(false);
  });

  it("drops date-shaped archives", () => {
    expect(shouldScrape("https://klinika.pl/2023/04/post-title")).toBe(false);
    expect(shouldScrape("https://klinika.pl/2024/12/")).toBe(false);
  });

  it("drops binary assets", () => {
    expect(shouldScrape("https://klinika.pl/cennik.pdf")).toBe(false);
    expect(shouldScrape("https://klinika.pl/photo.jpg")).toBe(false);
    expect(shouldScrape("https://klinika.pl/video.mp4")).toBe(false);
  });

  it("drops career / job pages", () => {
    expect(shouldScrape("https://klinika.pl/kariera/junior-vet")).toBe(false);
    expect(shouldScrape("https://klinika.pl/careers")).toBe(false);
    expect(shouldScrape("https://klinika.pl/job/vet-tech")).toBe(false);
  });

  it("DEFAULT_RELEVANCE_QUERY covers Polish receptionist keywords", () => {
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/cennik/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/usługi/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/kontakt/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/lekarze/);
    expect(DEFAULT_RELEVANCE_QUERY).toMatch(/faq/);
  });

  it("drops compound legal slugs via word-split (regression: dynastystomatology.pl)", () => {
    expect(shouldScrape("https://klinika.pl/privacy-policy-and-information-about-cookies")).toBe(false);
    expect(shouldScrape("https://klinika.pl/polityka-prywatnosci-i-informacja")).toBe(false);
    expect(shouldScrape("https://klinika.pl/cookie-settings")).toBe(false);
    expect(shouldScrape("https://klinika.pl/terms-and-conditions")).toBe(false);
  });

  it("does not drop legitimate compound slugs that share no blocked word", () => {
    expect(shouldScrape("https://klinika.pl/najlepsze-opcje-wybielania-zebow")).toBe(true);
    expect(shouldScrape("https://klinika.pl/stomatologia-dziecieca")).toBe(true);
    expect(shouldScrape("https://klinika.pl/implanty-zebowe")).toBe(true);
  });
});

describe("detectLanguagePrefixes (semantic, no hardcoded ISO list)", () => {
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
    const urls = [
      "https://klinika.pl/en/a",
      "https://klinika.pl/en/b",
      "https://klinika.pl/en/c",
    ];
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
    // /doctors/oleh-vus (Polish spelling) and /en/doctors/oleg-vus (English
    // transliteration) — old code missed this because exact tails differed.
    const urls = [
      "https://klinika.pl/doctors/oleh-vus",
      "https://klinika.pl/en/doctors/oleg-vus",
    ];
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
});

describe("filterCandidates (top-level)", () => {
  it("end-to-end on the dynastystomatology.pl regression set", () => {
    const urls = [
      "https://dynastystomatology.pl/uk/doctors/oleg-vus",
      "https://dynastystomatology.pl/en/doctors/oleh-vus",
      "https://dynastystomatology.pl/ru/doctors/oleg-vus",
      "https://dynastystomatology.pl/doctors/oleg-vus",
      "https://dynastystomatology.pl/en/privacy-policy-and-information-about-cookies",
      "https://dynastystomatology.pl/privacy-policy-and-information-about-cookies",
      "https://dynastystomatology.pl/uk/privacy-policy-and-information-about-cookies",
      "https://dynastystomatology.pl/najlepsze-opcje-wybielania-zebow-dla-twojego-usmiechu",
      "https://dynastystomatology.pl/doctors/ivan-olefirenko",
    ];
    const r = filterCandidates(urls);
    expect(r.kept).toContain("https://dynastystomatology.pl/doctors/oleg-vus");
    expect(r.kept).toContain("https://dynastystomatology.pl/doctors/ivan-olefirenko");
    expect(r.kept).toContain("https://dynastystomatology.pl/najlepsze-opcje-wybielania-zebow-dla-twojego-usmiechu");
    expect(r.kept.some((u) => u.includes("privacy-policy"))).toBe(false);
    expect(r.kept.some((u) => u.includes("/en/") || u.includes("/uk/") || u.includes("/ru/"))).toBe(false);
    expect(r.droppedJunk.length).toBeGreaterThan(0);
    expect(r.droppedTranslations.length).toBeGreaterThan(0);
    expect(r.detectedLanguagePrefixes.sort()).toEqual(["en", "ru", "uk"]);
  });
});

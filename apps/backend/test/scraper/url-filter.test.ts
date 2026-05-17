import { describe, it, expect } from "vitest";
import { shouldScrape, DEFAULT_RELEVANCE_QUERY } from "../../src/scraper/url-filter.js";

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
});

import { describe, it, expect } from "vitest";
import { extractInternalLinks } from "../../src/scraper/discover-links.js";

const page = (url: string, markdown: string) => ({ url, markdown });

describe("extractInternalLinks", () => {
  it("returns same-origin absolute links as canonical URLs", () => {
    const pages = [
      page(
        "https://klinika.pl/",
        "Check our [cennik](https://klinika.pl/cennik) and [team](https://klinika.pl/zespol)",
      ),
    ];
    const links = extractInternalLinks(pages, "https://klinika.pl/");
    expect(links).toContain("https://klinika.pl/cennik");
    expect(links).toContain("https://klinika.pl/zespol");
  });

  it("treats www and apex variants of the root host as same-origin", () => {
    // Bug fixed here: when user pastes 'https://indexmedica.com' but the
    // site canonicalizes to 'https://www.indexmedica.com', markdown links
    // pointing at the www variant must NOT be rejected as cross-origin.
    const pages = [
      page(
        "https://www.indexmedica.com/",
        "[Treatments](https://www.indexmedica.com/treatments) and [Team](https://www.indexmedica.com/team)",
      ),
    ];
    const links = extractInternalLinks(pages, "https://indexmedica.com");
    expect(links).toContain("https://indexmedica.com/treatments");
    expect(links).toContain("https://indexmedica.com/team");
  });

  it("strips trailing slashes and query strings from extracted links", () => {
    const pages = [
      page(
        "https://klinika.pl/",
        "[A](https://klinika.pl/a/) [B](https://klinika.pl/b?utm=src) [C](https://klinika.pl/c#hash)",
      ),
    ];
    const links = extractInternalLinks(pages, "https://klinika.pl/");
    expect(links).toContain("https://klinika.pl/a");
    expect(links).toContain("https://klinika.pl/b");
    expect(links).toContain("https://klinika.pl/c");
  });

  it("drops cross-origin links", () => {
    const pages = [
      page(
        "https://klinika.pl/",
        "[external](https://other.com/x) [internal](https://klinika.pl/y)",
      ),
    ];
    const links = extractInternalLinks(pages, "https://klinika.pl/");
    expect(links).toContain("https://klinika.pl/y");
    expect(links).not.toContain("https://other.com/x");
  });

  it("deduplicates the same logical URL across www / trailing-slash / fragment variants", () => {
    const pages = [
      page(
        "https://klinika.pl/",
        "[a](https://klinika.pl/x/) [b](https://www.klinika.pl/x) [c](https://klinika.pl/x?q=1)",
      ),
    ];
    const links = extractInternalLinks(pages, "https://klinika.pl/");
    const xCount = links.filter((u) => u === "https://klinika.pl/x").length;
    expect(xCount).toBe(1);
  });

  it("returns [] when rootUrl is unparseable", () => {
    expect(
      extractInternalLinks([page("https://x.pl/", "[a](https://x.pl/a)")], "not a url"),
    ).toEqual([]);
  });

  it("returns [] for empty markdown", () => {
    expect(extractInternalLinks([page("https://x.pl/", "")], "https://x.pl/")).toEqual([]);
  });
});

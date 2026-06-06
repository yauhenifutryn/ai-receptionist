#!/usr/bin/env tsx
/**
 * Consolidation model bench (2026-06-06, founder-requested).
 *
 * Scrapes the EXACT page set that triggered the price-dropout pathology on
 * mas-stomatologia.pl (URLs read from the rebuild log), ONCE, then runs
 * each candidate model on the identical input with fallbackChain=[] so
 * nothing silently substitutes. Scores: services/priced/staff counts,
 * 7-day hours completeness, verbatim ground-truth price checks against the
 * live cennik, dropout events, wall time, and estimated cost.
 *
 * Run:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/bench-consolidation.mts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { consolidate } from "../src/scraper/consolidate.js";
import { LLMClient, type LLMModel } from "../src/lib/llm.js";
import { createGeminiProvider } from "../src/lib/gemini-provider.js";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env missing: ${k}`);
  return v;
};

const MODELS: Array<{ model: LLMModel; usd: { in: number; out: number } }> = [
  { model: "gemini-2.5-pro", usd: { in: 1.25, out: 10.0 } },
  { model: "gemini-3.5-flash", usd: { in: 1.5, out: 9.0 } },
  { model: "gemini-3-flash-preview", usd: { in: 0.5, out: 3.0 } },
  { model: "gemini-3.1-flash-lite", usd: { in: 0.25, out: 1.5 } },
];

// Verbatim ground truth from https://mas-stomatologia.pl/pl/cennik
// (probe-verified 2026-06-06). [name fragment, exact price display fragment]
const GROUND_TRUTH: Array<[string, string]> = [
  ["Konsultacja", "100"],
  ["Znieczulenie", "50"],
  ["głębok", "550"], // Próchnica głęboka 550 zł
  ["Aparat stały metalowy", "2500"],
  ["Spark pakiet MINI", "16600"],
  ["INNO", "2000"], // Implant INNO (Korea)
];

const PAGES_CACHE = "/tmp/bench-mas-pages.json";

type Page = { url: string; markdown: string };

async function scrapePagesOnce(): Promise<Page[]> {
  if (existsSync(PAGES_CACHE)) {
    const cached = JSON.parse(readFileSync(PAGES_CACHE, "utf8")) as Page[];
    console.log(`pages: ${cached.length} (cached)`);
    return cached;
  }
  const log = readFileSync("/tmp/rebuild2-mas-stomatologia.log", "utf8");
  const urls = [...log.matchAll(/^ {2}page (\S+) -> \d+ chars$/gm)].map((m) => m[1]!);
  console.log(`scraping ${urls.length} URLs (one-time, ~${urls.length} credits)...`);
  const key = env("FIRECRAWL_API_KEY");
  const pages: Page[] = [];
  // concurrency 2 (plan maxConcurrency)
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++]!;
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: false,
            timeout: 45000,
          }),
        });
        const j = (await res.json()) as { data?: { markdown?: string } };
        const md = j.data?.markdown ?? "";
        if (md.length >= 200) pages.push({ url, markdown: md });
        console.log(`  ${url} -> ${md.length}`);
      } catch (e) {
        console.log(`  ${url} FAILED: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  writeFileSync(PAGES_CACHE, JSON.stringify(pages));
  return pages;
}

const pages = await scrapePagesOnce();
const inputChars = pages.reduce((s, p) => s + p.markdown.length, 0);
console.log(
  `input: ${pages.length} pages, ${inputChars} chars (~${Math.round(inputChars / 4 / 1000)}k tokens)\n`,
);

const results: Record<string, Record<string, unknown>> = {};

for (const { model, usd } of MODELS) {
  console.log(`===== ${model} =====`);
  const llm = new LLMClient(createGeminiProvider({ apiKey: env("GEMINI_API_KEY") }), {});
  const t0 = Date.now();
  let dropoutFired = false;
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    if (String(a[0]).includes("price dropout")) dropoutFired = true;
    origWarn(...a);
  };
  try {
    const out = await consolidate({
      rootUrl: "https://mas-stomatologia.pl/pl/",
      pages,
      llm,
      model,
      fallbackChain: [],
    });
    const secs = Math.round((Date.now() - t0) / 1000);
    const priced = out.services.filter((s) => s.price && s.price.qualifier !== "unknown");
    const hours = out.tenant.hours ?? ({} as Record<string, string>);
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const hoursFilled = days.filter((d) => (hours as Record<string, string>)[d]).length;
    const gt = GROUND_TRUTH.map(([frag, price]) => {
      const svc = out.services.find((s) => s.name.toLowerCase().includes(frag.toLowerCase()));
      const display = svc?.price?.display ?? "";
      const min = svc?.price?.min;
      return display.replace(/[\s ]/g, "").includes(price) || String(min) === price ? 1 : 0;
    });
    const outChars = JSON.stringify(out).length;
    const cost = (inputChars / 4 / 1e6) * usd.in + (outChars / 4 / 1e6) * usd.out;
    results[model] = {
      secs,
      services: out.services.length,
      priced: priced.length,
      staff: out.staff.length,
      staffWithSyns: out.staff.filter((s) => (s.specializationSynonyms ?? []).length > 0).length,
      hoursFilled: `${hoursFilled}/7`,
      groundTruth: `${gt.reduce((a: number, b) => a + b, 0)}/${GROUND_TRUTH.length}`,
      dropoutFired,
      estCostUSD: cost.toFixed(3),
    };
    writeFileSync(`/tmp/bench-${model}.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(results[model]));
  } catch (e) {
    results[model] = { error: (e as Error).message.slice(0, 200) };
    console.log(`FAILED: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    console.warn = origWarn;
  }
}

console.log("\n===== SUMMARY =====");
console.table(results);

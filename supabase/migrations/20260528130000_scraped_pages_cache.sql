-- 20260528130000_scraped_pages_cache.sql
-- Per-page scrape cache. Firecrawl times out (408 SCRAPE_TIMEOUT) on heavy
-- WordPress clinic pages, and each timeout burns ~30-45s before failing. This
-- table memoizes every SUCCESSFULLY scraped page by its canonical URL so that:
--   1. Re-running provisioning for a site skips pages already scraped (the
--      slow part) and only retries the ones that previously timed out —
--      chipping away at coverage on each click (eventually captures /kontakt
--      with phone + hours).
--   2. Re-running consolidation reuses the cached scrape instead of re-paying
--      Firecrawl, so "fix the KB" is fast.
--
-- Public website content only — no patient PII — so the cache is global
-- (cross-operator): any operator scraping the same clinic benefits. The
-- scrape route applies a freshness window (re-scrape if older than N days)
-- since clinic sites change.

create table if not exists scraped_pages (
  -- canonicalizeUrl() of the page URL: lowercased host, no www, no trailing
  -- slash, no query/fragment. Dedupes www/apex variants of the same page.
  url text primary key,
  markdown text not null,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_scraped_pages_scraped_at on scraped_pages(scraped_at desc);

alter table scraped_pages enable row level security;

create policy scraped_pages_select on scraped_pages
  for select using (is_operator(auth.uid()));

create policy scraped_pages_insert on scraped_pages
  for insert with check (is_operator(auth.uid()));

create policy scraped_pages_update on scraped_pages
  for update using (is_operator(auth.uid())) with check (is_operator(auth.uid()));

create policy scraped_pages_delete on scraped_pages
  for delete using (is_operator(auth.uid()));

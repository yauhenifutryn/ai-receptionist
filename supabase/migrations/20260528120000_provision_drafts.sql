-- 20260528120000_provision_drafts.sql
-- In-progress provisioning drafts: scrape + Gemini consolidation results
-- persisted server-side so an operator can navigate away and come back, and
-- so re-pasting the same URL reuses the cached scrape instead of paying for
-- Firecrawl + Gemini again. A draft becomes a real tenant+agent only on
-- "Provision"; until then it lives here and shows in the dashboard's
-- "In progress" section.
--
-- Keyed by canonical_url (unique) — re-preparing the same site UPSERTS the
-- single draft for that URL rather than piling up duplicates. No patient PII
-- ever lands here (public clinic website data + generated KB only), so the
-- table is operator-visible cross-operator, matching the agents table model.

create table if not exists provision_drafts (
  id uuid primary key default gen_random_uuid(),
  -- Who scraped it (for the dashboard "Owner" display). Not a security
  -- boundary: any operator may continue or delete any draft.
  operator_user_id uuid not null,
  -- Raw URL as the operator typed it (shown in the UI).
  source_url text not null,
  -- canonicalizeUrl() output — the cache key. Lowercased host, no www, no
  -- trailing slash, no query/fragment. UNIQUE so re-prepare upserts.
  canonical_url text not null,
  tenant_name text not null,
  knowledge_markdown text not null,
  system_prompt text not null,
  -- CoverageReport + scraperSummary blocks the review screen renders.
  coverage jsonb,
  scraper_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url)
);

create index if not exists idx_provision_drafts_canonical on provision_drafts(canonical_url);
create index if not exists idx_provision_drafts_created on provision_drafts(created_at desc);

alter table provision_drafts enable row level security;

-- Operator-only CRUD. Mirrors the agents/tenants operator policies.
create policy provision_drafts_select on provision_drafts
  for select using (is_operator(auth.uid()));

create policy provision_drafts_insert on provision_drafts
  for insert with check (is_operator(auth.uid()));

create policy provision_drafts_update on provision_drafts
  for update using (is_operator(auth.uid())) with check (is_operator(auth.uid()));

create policy provision_drafts_delete on provision_drafts
  for delete using (is_operator(auth.uid()));

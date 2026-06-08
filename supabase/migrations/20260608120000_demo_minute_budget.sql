-- Per-clinic demo minute budget.
--
-- ElevenLabs ConvAI bills per minute and every agent draws from ONE shared
-- workspace credit pool. Without a cap, one clinic testing heavily via its
-- PIN could drain the pool and leave the other clinics unable to test. This
-- adds a per-agent budget (default 1800s = 30 min). Usage is summed from
-- conversations.duration_seconds since `demo_budget_since` and enforced at
-- call start in the phone IVR resolve route (apps/web/lib/demo-budget.ts):
-- a correct PIN routes to a "demo limit reached" prompt instead of <Dial>
-- once the agent is over budget.
--
-- `default now()` backfills existing agents to the migration-apply instant,
-- so demo minutes spent before this shipped are NOT metered (each clinic
-- starts with a fresh 30 min). New agents inherit the same defaults.
alter table agents
  add column if not exists demo_seconds_budget int not null default 1800,
  add column if not exists demo_budget_since timestamptz not null default now();

comment on column agents.demo_seconds_budget is
  'Per-clinic demo budget in seconds (default 1800 = 30 min). The phone demo refuses to dial once metered usage reaches this. <=0 falls back to the app default.';
comment on column agents.demo_budget_since is
  'Start of the demo-budget window. Conversation minutes before this instant are not metered (set to now() so pre-launch test minutes do not count against the budget).';

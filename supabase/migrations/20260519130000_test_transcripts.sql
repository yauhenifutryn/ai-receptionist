-- 20260519130000_test_transcripts.sql
-- Mirror browser-test transcripts to cloud storage so sales reps can review
-- demo conversations across devices, grep for caller patterns in their cold
-- email iteration, and (post-sale) expose to clients via the dashboard.
--
-- Real-call transcripts are already captured in `transcripts` via the EL
-- post-call webhook. This table holds the LIVE turn-by-turn data from the
-- browser test page (/test/[agentId]), which the post-call webhook doesn't
-- emit for test sessions.
--
-- On Vercel the original local-FS writes silently no-op (read-only build
-- artifact); this table is the durable replacement.

create table if not exists test_transcripts (
  id uuid primary key default gen_random_uuid(),
  -- EL agent id (string). We do NOT FK to agents.provider_agent_id because
  -- the source-of-truth for legitimate provider ids is ElevenLabs, not us
  -- (an operator might test an EL agent that hasn't been provisioned via
  -- our wizard yet, e.g. a hand-built one).
  provider_agent_id text not null,
  conversation_id text not null,
  role text not null check (role in ('user', 'agent')),
  text text not null,
  source text check (source in ('voice', 'chat')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_test_transcripts_agent_conv
  on test_transcripts(provider_agent_id, conversation_id, recorded_at);

create index if not exists idx_test_transcripts_conv
  on test_transcripts(conversation_id);

-- RLS: operators bypass via is_operator(auth.uid()). Inserts come from the
-- service-role endpoint (no end-user JWT — the test page POSTs from an
-- operator browser session but the route uses service role to insert,
-- since this data is internal QA, not customer-facing).
alter table test_transcripts enable row level security;

drop policy if exists test_transcripts_select on test_transcripts;
create policy test_transcripts_select on test_transcripts
  for select using (is_operator(auth.uid()));

-- No insert policy: only service-role can insert. End-user clients cannot
-- write directly even when authenticated (so client-side rate-limit attacks
-- against the table itself are impossible).

comment on table test_transcripts is
  'Browser-test transcripts (operator QA on /test/[agentId]). Real-call transcripts live in `transcripts` and are gated on consent_log.consent_flag. Test transcripts have no consent gate because the operator IS the caller.';

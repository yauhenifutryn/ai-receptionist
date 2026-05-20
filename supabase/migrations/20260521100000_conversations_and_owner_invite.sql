-- 20260521100000_conversations_and_owner_invite.sql
-- Chat C §4.4 + items 1-3 of §4.1: canonical per-call record, source tags
-- for the live-stream table, and the owner-invite ledger.

-- 1) conversations: canonical post-call record across PSTN/browser/PIN.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  provider_agent_id text not null,
  source text not null check (source in ('pstn','browser_test','pin_demo')),
  direction text check (direction in ('inbound','outbound')),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  end_reason text,
  consent_flag boolean,
  consent_decision text,
  caller_language text,
  appointment_category text,
  escalated boolean default false,
  escalation_reason text,
  booked_booking_id uuid references bookings(id) on delete set null,
  tool_call_count int default 0,
  tool_error_count int default 0,
  raw_jsonb jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_pstn_consent_gate check (
    source <> 'pstn'
    or consent_flag = true
    or raw_jsonb is null
    or (raw_jsonb -> 'transcript') is null
  )
);

create index if not exists idx_conversations_tenant_started
  on conversations(tenant_id, started_at desc);
create index if not exists idx_conversations_agent_started
  on conversations(provider_agent_id, started_at desc);
create index if not exists idx_conversations_source on conversations(source);
create index if not exists idx_conversations_booking
  on conversations(booked_booking_id)
  where booked_booking_id is not null;

alter table conversations enable row level security;

drop policy if exists conversations_select_operator on conversations;
create policy conversations_select_operator on conversations
  for select using (is_operator(auth.uid()));

drop policy if exists conversations_select_tenant_member on conversations;
create policy conversations_select_tenant_member on conversations
  for select using (is_tenant_member(tenant_id));

-- 2) test_transcripts.surface to distinguish operator QA from prospect demo.
alter table test_transcripts
  add column if not exists surface text
  check (surface in ('browser_test','pin_demo'));

update test_transcripts set surface = 'browser_test' where surface is null;

-- 3) tenant_invitations: pre-signup invite ledger.
create table if not exists tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null default 'owner',
  invited_by_operator uuid,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique (tenant_id, email)
);

create index if not exists idx_tenant_invitations_email_pending
  on tenant_invitations(email) where consumed_at is null;

alter table tenant_invitations enable row level security;

drop policy if exists tenant_invitations_select_operator on tenant_invitations;
create policy tenant_invitations_select_operator on tenant_invitations
  for select using (is_operator(auth.uid()));

-- 4) updated_at trigger for conversations.
create or replace function set_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function set_conversations_updated_at();

comment on table conversations is
  'Canonical post-call record. Fed by EL post-call webhook (PSTN) and the /api/conversations/finalize route (browser/PIN). Transcript+tools live in raw_jsonb to keep schema flat. Consent gate enforced for source=pstn.';
comment on table tenant_invitations is
  'Pending owner invitations. On first OTP sign-in, materialized into tenant_members and marked consumed.';

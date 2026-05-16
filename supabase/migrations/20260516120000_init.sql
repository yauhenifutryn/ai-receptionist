-- 0000_init.sql — vertical-agnostic core schema for AI Receptionist.
-- Apply in Supabase Frankfurt (eu-central-1).
-- Source of truth for shapes is packages/contracts/src/*.

-- ============================================================
-- Extensions
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- Enums (mirror packages/contracts)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_category') then
    create type appointment_category as enum (
      'consultation',
      'routine_service',
      'complex_service',
      'follow_up',
      'emergency_triage',
      'information_only',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'consent_decision') then
    create type consent_decision as enum ('yes', 'no', 'ambiguous');
  end if;

  if not exists (select 1 from pg_type where typname = 'caller_language') then
    create type caller_language as enum ('pl', 'en', 'ru');
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_status') then
    create type agent_status as enum ('provisioning', 'live', 'paused', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum ('booked', 'cancelled', 'completed', 'no_show');
  end if;

  if not exists (select 1 from pg_type where typname = 'voice_provider') then
    create type voice_provider as enum ('elevenlabs', 'vapi', 'synthflow', 'other');
  end if;
end $$;

-- ============================================================
-- Tables
-- ============================================================

-- tenants — one row per onboarded business.
create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  display_name text not null,
  owner_email text,
  vertical text, -- nullable until 2026-05-18 vertical lock; thereafter set per tenant.
  source_url text, -- the URL Firecrawl scraped from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tenant_members — joins Supabase auth users to tenants for RLS.
create table if not exists tenant_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_tenant_members_user on tenant_members(user_id);

-- agents — one row per provisioned voice agent (one per tenant for now).
create table if not exists agents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider voice_provider not null default 'elevenlabs',
  provider_agent_id text not null, -- ElevenLabs agent id
  voice_id text,
  default_language caller_language not null default 'pl',
  status agent_status not null default 'provisioning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_agent_id)
);

create index if not exists idx_agents_tenant on agents(tenant_id);

-- bookings — one row per (attempted) booking.
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  conversation_id text not null,
  request_id uuid not null, -- the agent's idempotency key
  slot_id text not null, -- provider-side slot identifier
  external_id text, -- PMS-side booking identifier when applicable
  patient_name text not null, -- PII: redact in logs
  patient_phone text not null, -- PII: redact in logs
  appointment_category appointment_category not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status booking_status not null default 'booked',
  recovered_revenue_pln numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id) -- enforces server-tool idempotency
);

create index if not exists idx_bookings_tenant on bookings(tenant_id);
create index if not exists idx_bookings_conversation on bookings(conversation_id);

-- consent_log — one row per call regardless of decision (audit trail).
create table if not exists consent_log (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  conversation_id text not null,
  caller_language caller_language not null,
  decision consent_decision not null,
  consent_flag boolean not null,
  classifier_confidence numeric(3, 2) not null check (classifier_confidence between 0 and 1),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_consent_log_tenant on consent_log(tenant_id);
create unique index if not exists uq_consent_log_conversation on consent_log(conversation_id);

-- transcripts — gated on consent_flag = true.
create table if not exists transcripts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id text not null,
  -- Full transcript JSON (matches PostCallTranscriptTurn[] in contracts).
  turns jsonb not null,
  created_at timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists idx_transcripts_tenant on transcripts(tenant_id);

-- DB-side enforcement of consent gate. Any insert into transcripts must have
-- a matching consent_log row with consent_flag = true. Defense-in-depth on top
-- of the application-level check in apps/backend/post-call/.
create or replace function enforce_consent_for_transcript()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from consent_log
    where conversation_id = new.conversation_id
      and consent_flag = true
  ) then
    raise exception 'transcript insert blocked: no consent_log row with consent_flag=true for conversation_id=%', new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_consent_for_transcript on transcripts;
create trigger trg_enforce_consent_for_transcript
  before insert on transcripts
  for each row
  execute function enforce_consent_for_transcript();

-- service_value_matrix — per-tenant revenue table for ROI math.
create table if not exists service_value_matrix (
  tenant_id uuid not null references tenants(id) on delete cascade,
  category appointment_category not null,
  expected_revenue_pln numeric(10, 2) not null check (expected_revenue_pln >= 0),
  show_rate numeric(3, 2) not null default 0.7 check (show_rate between 0 and 1),
  matches_service_names jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, category)
);

-- ============================================================
-- updated_at maintenance
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenants_updated_at on tenants;
create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

drop trigger if exists trg_agents_updated_at on agents;
create trigger trg_agents_updated_at
  before update on agents
  for each row execute function set_updated_at();

drop trigger if exists trg_bookings_updated_at on bookings;
create trigger trg_bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- Helper: returns true if the current auth.uid() is a member of the given tenant.
create or replace function is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tenant_members
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
  );
$$;

alter table tenants enable row level security;
alter table tenant_members enable row level security;
alter table agents enable row level security;
alter table bookings enable row level security;
alter table consent_log enable row level security;
alter table transcripts enable row level security;
alter table service_value_matrix enable row level security;

-- tenants: members can read+update their own tenant. service_role bypasses RLS.
drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants
  for select using (is_tenant_member(id));

drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants
  for update using (is_tenant_member(id)) with check (is_tenant_member(id));

-- tenant_members: a user can see only their own memberships.
drop policy if exists tenant_members_select on tenant_members;
create policy tenant_members_select on tenant_members
  for select using (user_id = auth.uid());

-- agents: scoped to tenant.
drop policy if exists agents_select on agents;
create policy agents_select on agents
  for select using (is_tenant_member(tenant_id));

-- bookings: scoped to tenant.
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select using (is_tenant_member(tenant_id));

-- consent_log: scoped to tenant.
drop policy if exists consent_log_select on consent_log;
create policy consent_log_select on consent_log
  for select using (is_tenant_member(tenant_id));

-- transcripts: scoped to tenant. Insert/update is service-role-only via RLS bypass.
drop policy if exists transcripts_select on transcripts;
create policy transcripts_select on transcripts
  for select using (is_tenant_member(tenant_id));

-- service_value_matrix: scoped to tenant; members can edit.
drop policy if exists svm_select on service_value_matrix;
create policy svm_select on service_value_matrix
  for select using (is_tenant_member(tenant_id));

drop policy if exists svm_insert on service_value_matrix;
create policy svm_insert on service_value_matrix
  for insert with check (is_tenant_member(tenant_id));

drop policy if exists svm_update on service_value_matrix;
create policy svm_update on service_value_matrix
  for update using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists svm_delete on service_value_matrix;
create policy svm_delete on service_value_matrix
  for delete using (is_tenant_member(tenant_id));

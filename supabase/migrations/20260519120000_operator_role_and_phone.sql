-- 20260519120000_operator_role_and_phone.sql
-- Chat 1: add operator role (sales reps provision on behalf of prospects),
-- augment RLS so operators can read/write all tenants while owners stay
-- tenant-scoped, add phone_number on agents (Twilio binding), add audit
-- columns for provisioned_by.
--
-- See docs/plans/2026-05-19-chat1-prod-auth.md for the strategic context:
-- clients NEVER self-provision; sales reps create agents + assign phone
-- numbers; clients only get post-sale dashboard access (Chat 3).

-- ============================================================
-- 1. Whitelist of operator emails (seeded by deploy)
-- ============================================================

create table if not exists operator_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

comment on table operator_emails is
  'Emails authorized to become operators (sales reps). Seeded from OPERATOR_EMAILS env at deploy. A trigger on auth.users insert promotes a matching email into the operators table.';

-- ============================================================
-- 2. Operators table (1:1 with auth.users for matched emails)
-- ============================================================

create table if not exists operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_operators_email on operators(email);

comment on table operators is
  'Users (auth.users.id) flagged as operators / sales reps. Auto-populated by trg_promote_operator_on_signup when a user with a whitelisted email signs up.';

-- ============================================================
-- 3. Auto-promote trigger on auth.users insert
-- ============================================================

create or replace function promote_operator_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and exists (
    select 1 from operator_emails where lower(email) = lower(new.email)
  ) then
    insert into operators (user_id, email)
    values (new.id, new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promote_operator_on_signup on auth.users;
create trigger trg_promote_operator_on_signup
  after insert on auth.users
  for each row
  execute function promote_operator_on_signup();

-- ============================================================
-- 4. is_operator() helper for RLS
-- ============================================================

create or replace function is_operator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from operators where user_id = p_user
  );
$$;

-- ============================================================
-- 5. Schema additions on existing tables
-- ============================================================

-- tenants: who provisioned this clinic (sales rep audit trail).
alter table tenants
  add column if not exists provisioned_by_user_id uuid references auth.users(id);

create index if not exists idx_tenants_provisioned_by on tenants(provisioned_by_user_id);

-- agents: provisioning operator + assigned PSTN number (Twilio E.164).
alter table agents
  add column if not exists provisioned_by_user_id uuid references auth.users(id);

alter table agents
  add column if not exists phone_number text;

create unique index if not exists uq_agents_phone_number
  on agents(phone_number) where phone_number is not null;

create index if not exists idx_agents_provisioned_by on agents(provisioned_by_user_id);

-- tenant_members.role: tighten with check constraint. Existing default 'owner'
-- stays; operators get role 'operator' when they auto-link to a tenant they
-- provisioned; future admin role reserved.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'tenant_members'
      and constraint_name = 'tenant_members_role_check'
  ) then
    alter table tenant_members
      add constraint tenant_members_role_check
      check (role in ('owner', 'operator', 'admin'));
  end if;
end $$;

-- ============================================================
-- 6. RLS — augment existing policies with operator bypass
-- ============================================================

-- tenants
drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants
  for select using (is_operator(auth.uid()) or is_tenant_member(id));

drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants
  for update
  using (is_operator(auth.uid()) or is_tenant_member(id))
  with check (is_operator(auth.uid()) or is_tenant_member(id));

drop policy if exists tenants_insert on tenants;
create policy tenants_insert on tenants
  for insert with check (is_operator(auth.uid()));

drop policy if exists tenants_delete on tenants;
create policy tenants_delete on tenants
  for delete using (is_operator(auth.uid()));

-- tenant_members
drop policy if exists tenant_members_select on tenant_members;
create policy tenant_members_select on tenant_members
  for select using (
    is_operator(auth.uid()) or user_id = auth.uid()
  );

drop policy if exists tenant_members_insert on tenant_members;
create policy tenant_members_insert on tenant_members
  for insert with check (is_operator(auth.uid()));

drop policy if exists tenant_members_delete on tenant_members;
create policy tenant_members_delete on tenant_members
  for delete using (is_operator(auth.uid()));

-- agents
drop policy if exists agents_select on agents;
create policy agents_select on agents
  for select using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

drop policy if exists agents_insert on agents;
create policy agents_insert on agents
  for insert with check (is_operator(auth.uid()));

drop policy if exists agents_update on agents;
create policy agents_update on agents
  for update
  using (is_operator(auth.uid()) or is_tenant_member(tenant_id))
  with check (is_operator(auth.uid()) or is_tenant_member(tenant_id));

drop policy if exists agents_delete on agents;
create policy agents_delete on agents
  for delete using (is_operator(auth.uid()));

-- bookings: SELECT for tenant members + operators. INSERTs come from
-- service-role webhook context (server tool), so no insert policy needed
-- here — service role bypasses RLS.
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

-- consent_log: same pattern as bookings.
drop policy if exists consent_log_select on consent_log;
create policy consent_log_select on consent_log
  for select using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

-- transcripts: same pattern. Insert is service-role-only (webhook).
drop policy if exists transcripts_select on transcripts;
create policy transcripts_select on transcripts
  for select using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

-- service_value_matrix
drop policy if exists svm_select on service_value_matrix;
create policy svm_select on service_value_matrix
  for select using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

drop policy if exists svm_insert on service_value_matrix;
create policy svm_insert on service_value_matrix
  for insert with check (is_operator(auth.uid()) or is_tenant_member(tenant_id));

drop policy if exists svm_update on service_value_matrix;
create policy svm_update on service_value_matrix
  for update
  using (is_operator(auth.uid()) or is_tenant_member(tenant_id))
  with check (is_operator(auth.uid()) or is_tenant_member(tenant_id));

drop policy if exists svm_delete on service_value_matrix;
create policy svm_delete on service_value_matrix
  for delete using (is_operator(auth.uid()) or is_tenant_member(tenant_id));

-- ============================================================
-- 7. operators table RLS — users can read their own operator row
-- ============================================================

alter table operators enable row level security;
alter table operator_emails enable row level security;

drop policy if exists operators_select_self on operators;
create policy operators_select_self on operators
  for select using (user_id = auth.uid() or is_operator(auth.uid()));

-- operator_emails is admin-only; users cannot read the whitelist directly.
-- Service role (deploy scripts) bypasses RLS to seed it. No policy = no
-- access for end users, which is what we want.

-- ============================================================
-- 8. Convenience: seed the whitelist from the deploy environment
-- ============================================================
-- Not done here; deploy script (or one-off psql) seeds operator_emails:
--   insert into operator_emails (email) values
--     ('yauheni.futryn@gmail.com'),
--     ('<sebastian-email>'),
--     ('<rem-email>')
--   on conflict do nothing;

-- 20260520150000_outreach_status_and_operators.sql
-- Operator-facing CRM workflow + display-name support:
--   • Outreach status per agent (created → audited → contacted → positive/negative)
--   • Operator display_name (used in dashboard "Owner" column)
--   • Seed operator_emails with Yauheni, Sebastian, Rem
-- No data destruction; all changes are additive with safe defaults.

-- ============================================================
-- 1. Outreach status enum + columns on agents
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'outreach_status') then
    create type outreach_status as enum (
      'created',    -- auto: agent provisioned, ready for audit
      'audited',    -- manual: operator verified scraped knowledge quality
      'contacted',  -- manual: cold email or call sent to the clinic
      'positive',   -- manual: prospect responded positively / agreed to pilot
      'negative'    -- manual: prospect declined or went silent
    );
  end if;
end $$;

alter table agents
  add column if not exists outreach_status outreach_status not null default 'created',
  add column if not exists outreach_notes text,
  add column if not exists outreach_status_updated_at timestamptz;

create index if not exists idx_agents_outreach_status
  on agents(outreach_status);

-- ============================================================
-- 2. Operator display name
-- ============================================================
-- Used in the dashboard's "Owner" column. Pulled from a small lookup so we
-- can show "Yauheni" / "Rem" / "Sebastian" instead of raw emails.

alter table operators
  add column if not exists display_name text;

alter table operator_emails
  add column if not exists display_name text;

-- Backfill display_name on operators by joining operator_emails for any
-- existing operator rows. Safe-rerun.
update operators o
   set display_name = oe.display_name
  from operator_emails oe
 where o.user_id in (select id from auth.users where lower(email) = lower(oe.email))
   and oe.display_name is not null
   and o.display_name is null;

-- ============================================================
-- 3. Update the auto-promote trigger to carry display_name through
-- ============================================================

create or replace function promote_operator_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  -- Only promote if the email is on the whitelist.
  select display_name
    into v_display_name
    from operator_emails
   where lower(email) = lower(new.email)
   limit 1;
  if found then
    insert into operators (user_id, display_name)
      values (new.id, v_display_name)
      on conflict (user_id) do update
        set display_name = excluded.display_name;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 4. Seed the operator whitelist
-- ============================================================
-- Idempotent: INSERT ... ON CONFLICT updates the display_name if it already
-- exists. Lower-case the email on insert to match the auto-promote check.

insert into operator_emails (email, display_name)
values
  ('yauheni.futryn@gmail.com', 'Yauheni'),
  ('wodecki.sg@gmail.com',     'Sebastian'),
  ('grednep@gmail.com',        'Rem')
on conflict (email) do update
  set display_name = excluded.display_name;

-- Backfill display_name on already-promoted operators that match the seeded
-- emails. Without this, the existing Yauheni operator row stays NULL until
-- a re-login.
update operators o
   set display_name = oe.display_name
  from operator_emails oe
   join auth.users u on lower(u.email) = lower(oe.email)
 where o.user_id = u.id
   and oe.display_name is not null;

comment on column agents.outreach_status is
  'CRM workflow state per agent. Default ''created'' on provisioning; operator manually advances to audited → contacted → positive|negative.';

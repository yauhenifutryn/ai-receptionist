-- 20260521160000_fix_promote_operator_trigger.sql
--
-- Fix the `promote_operator_on_signup` trigger that was introduced in
-- 20260519120000 and modified in 20260520150000. The current version
-- inserts into `operators (user_id, display_name)` but `operators.email`
-- is `text NOT NULL`. The auto-promote insert therefore fails with a NOT
-- NULL constraint violation on every signup, which rolls back the parent
-- `auth.users` insert and surfaces as "Database error saving new user"
-- when `auth.admin.generateLink({ type: "magiclink" })` tries to create
-- a not-yet-existing user.
--
-- Impact:
--   - Yauheni (signed up before the bug was introduced) has an operators
--     row and works fine.
--   - Rem (grednep@gmail.com) and Sebastian (wodecki.sg@gmail.com) cannot
--     be created via admin API or normal signup — both blocked.
--
-- Fix: include `new.email` in the INSERT and add `email = excluded.email`
-- to the `on conflict do update` branch so the fix self-heals for any
-- existing rows that might have a stale email after this lands.

create or replace function promote_operator_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  select display_name
    into v_display_name
    from operator_emails
   where lower(email) = lower(new.email)
   limit 1;
  if found then
    insert into operators (user_id, email, display_name)
      values (new.id, new.email, v_display_name)
      on conflict (user_id) do update
        set email = excluded.email,
            display_name = excluded.display_name;
  end if;
  return new;
end;
$$;

-- Re-binding the trigger isn't necessary (CREATE OR REPLACE FUNCTION
-- preserves the existing trigger reference), but document it for
-- migration readers.
comment on function promote_operator_on_signup() is
  'After-insert trigger on auth.users. Auto-promotes a user to operator if their email is in operator_emails. Fixed 2026-05-21 to include email in the INSERT (operators.email is NOT NULL).';

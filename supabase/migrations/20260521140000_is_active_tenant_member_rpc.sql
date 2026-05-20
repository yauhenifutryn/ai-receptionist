-- 20260521140000_is_active_tenant_member_rpc.sql
-- Adds the third allow-list path for /auth/sign-in:
--   1. operator_emails (existing operators)
--   2. tenant_invitations with consumed_at IS NULL (first-time owner bootstrap)
--   3. is_active_tenant_member() — already-materialized tenant_members
--
-- Without (3), an owner's invitation is consumed on first sign-in, and
-- subsequent sign-in attempts get 403 because they're not in operator_emails
-- and have no pending invitation. The membership row is the source of truth
-- for "this email is an owner of some tenant".
--
-- The function is SECURITY DEFINER so it can join auth.users (which is
-- read-restricted otherwise). Returns boolean only — never leaks user data.
-- Case-insensitive on email match.

create or replace function is_active_tenant_member(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tenant_members tm
    join auth.users u on u.id = tm.user_id
    where lower(u.email) = lower(p_email)
  );
$$;

-- Anon role doesn't need to call this directly — only the service-role
-- callers (request-magic-link + verify-otp) do. Lock down accordingly.
revoke all on function is_active_tenant_member(text) from public;
revoke all on function is_active_tenant_member(text) from anon;
revoke all on function is_active_tenant_member(text) from authenticated;
grant execute on function is_active_tenant_member(text) to service_role;

comment on function is_active_tenant_member(text) is
  'Returns true if this email belongs to a user with at least one tenant_members row. Used by /auth/sign-in to keep already-onboarded owners signed-in-able after their tenant_invitation has been consumed. Service-role only.';

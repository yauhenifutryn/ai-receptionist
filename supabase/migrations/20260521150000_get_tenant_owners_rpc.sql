-- 20260521150000_get_tenant_owners_rpc.sql
-- Adds an RPC that returns the active owners (tenant_members) of a tenant,
-- joined with auth.users for email + last_sign_in_at. Needed because the
-- /api/agents/[id]/owners list panel wants to render active members AND
-- pending invitations side-by-side, and the service-role JS client can't
-- join auth.users directly via PostgREST.
--
-- SECURITY DEFINER lets the function read auth.users, which is otherwise
-- locked down. Grant restricted to service_role (the API route uses the
-- service-role client after the operator gate has already fired in JS).

create or replace function get_tenant_owners(p_tenant_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  member_since timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    tm.user_id,
    u.email::text as email,
    tm.role,
    tm.created_at as member_since,
    u.last_sign_in_at
  from tenant_members tm
  join auth.users u on u.id = tm.user_id
  where tm.tenant_id = p_tenant_id
  order by lower(u.email) asc;
$$;

revoke all on function get_tenant_owners(uuid) from public;
revoke all on function get_tenant_owners(uuid) from anon;
revoke all on function get_tenant_owners(uuid) from authenticated;
grant execute on function get_tenant_owners(uuid) to service_role;

comment on function get_tenant_owners(uuid) is
  'Returns active tenant_members for a tenant with their email + last_sign_in_at from auth.users. Service-role only; the API route gates by operator_emails in JS before calling this.';

-- 20260521130000_tenant_invitations_long_signin_token.sql
-- Adds a long-TTL sign-in token to tenant_invitations so operators can
-- generate a copy-paste sign-in URL that lasts longer than Supabase's
-- 1-hour magic-link default. The token wraps an admin.generateLink call:
-- the prospect clicks at any point inside the TTL window, the server
-- mints a fresh 1h action_link at click time and 302-redirects to it.
-- That way the outer URL survives back-and-forth with a prospect while
-- the inner Supabase token stays short-lived per security.

alter table tenant_invitations
  add column if not exists signin_token text,
  add column if not exists signin_token_expires_at timestamptz,
  add column if not exists signin_token_consumed_at timestamptz;

create unique index if not exists uq_tenant_invitations_signin_token
  on tenant_invitations(signin_token)
  where signin_token is not null;

comment on column tenant_invitations.signin_token is
  'Opaque long-lived token (uuid v4). Used in /auth/owner-link?token=… to start a sign-in without requiring email delivery. Rotated each time the operator regenerates a link.';
comment on column tenant_invitations.signin_token_expires_at is
  'When the long-TTL outer token stops working. Default 14 days from issuance. Independent of Supabase action_link TTL (1h).';
comment on column tenant_invitations.signin_token_consumed_at is
  'Set on first successful click. Subsequent clicks of the same token are refused (single-use). Operator can regenerate to reset.';

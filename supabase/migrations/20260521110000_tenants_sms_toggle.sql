-- 20260521110000_tenants_sms_toggle.sql
-- Item 7 of Chat C §4.1: owner-controlled SMS confirmations toggle.
-- Default `true` preserves existing behavior on every clinic that's already
-- live; opt-out is one PATCH from /owner/settings.

alter table tenants
  add column if not exists sms_confirmations_enabled boolean not null default true;

comment on column tenants.sms_confirmations_enabled is
  'Owner-controlled toggle. When false, Booking SMS side-effect is skipped silently. Default true (existing behavior).';

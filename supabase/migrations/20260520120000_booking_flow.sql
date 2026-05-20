-- 20260520120000_booking_flow.sql
-- Chat B (booking flow) schema. Adds:
--   • agents.pin_code        — PIN-pad IVR routing + WebRTC /demo gate
--   • tenants.contact_phone  — clinic phone for "aby odwolac" SMS line
--   • bookings.short_token   — URL-safe slug for /b/<token> confirmation page
--   • sms_send_failures      — observability for non-blocking SMS failures
-- All RLS uses the is_operator(auth.uid()) / is_tenant_member(...) helpers
-- defined in 20260519120000_operator_role_and_phone.sql.

-- ============================================================
-- 1. PIN-based call routing
-- ============================================================
-- Operator generates a numeric PIN per agent at provisioning time. Used for:
--   (a) PSTN inbound: Twilio webhook plays IVR, prospect enters PIN, we route
--       to the matching EL agent via SIP <Dial>.
--   (b) WebRTC /demo/<agentId>?pin=X gate: server-side PIN check before
--       rendering the public voice/chat client.

alter table agents
  add column if not exists pin_code text;

create unique index if not exists uq_agents_pin_code
  on agents(pin_code) where pin_code is not null;

-- ============================================================
-- 2. Clinic contact phone (production-pilot SMS cancellation line)
-- ============================================================
-- Distinct from agents.phone_number (which is the Twilio/Zadarma inbound PSTN
-- number that prospects dial). This is the CLINIC'S OWN phone — what the
-- patient should call to cancel their appointment. Null in sales-demo phase
-- (we omit the "aby odwolac" line); populated by operator at pilot onboarding.

alter table tenants
  add column if not exists contact_phone text;

-- ============================================================
-- 3. Confirmation-page short URL token
-- ============================================================
-- 8-char URL-safe nanoid (alphabet excludes 0/O/1/l/I). Drives the public
-- /b/<token> page + /b/<token>/calendar.ics endpoint. UUIDs in URLs feel
-- sloppy; short tokens are operator-friendly and printable on stage.

alter table bookings
  add column if not exists short_token text;

create unique index if not exists uq_bookings_short_token
  on bookings(short_token) where short_token is not null;

-- ============================================================
-- 4. SMS failure observability
-- ============================================================
-- One row per failed SMS send. The booking pipeline NEVER fails on SMS error
-- (sendBookingConfirmation returns {ok:false} and the booking still completes
-- — the agent's spoken confirmation is the authoritative success signal).
-- This table gives operators visibility into delivery problems without
-- blocking customer-facing flows.

create table if not exists sms_send_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  to_phone text not null, -- PII: redact in logs
  attempted_at timestamptz not null default now(),
  error_code text,
  error_message text
);

create index if not exists idx_sms_send_failures_booking
  on sms_send_failures(booking_id);

create index if not exists idx_sms_send_failures_tenant
  on sms_send_failures(tenant_id);

alter table sms_send_failures enable row level security;

drop policy if exists sms_send_failures_select on sms_send_failures;
create policy sms_send_failures_select on sms_send_failures
  for select using (
    is_operator(auth.uid())
    or (tenant_id is not null and is_tenant_member(tenant_id))
  );

-- No insert policy: only service-role can write (the SMS adapter runs
-- server-side outside any user session). Mirrors the test_transcripts
-- pattern from 20260519130000.

comment on table sms_send_failures is
  'Non-blocking SMS delivery failures. Booking pipeline logs here when the SMS provider (Zadarma / SMSAPI) returns a non-success. The booking itself is committed regardless — the agent''s in-call confirmation is the authoritative success signal.';

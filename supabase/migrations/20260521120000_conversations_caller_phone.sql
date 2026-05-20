-- Caller phone for repeat-caller analytics. Populated from EL metadata
-- (phone_call.from_phone_number) for PSTN. Null for browser_test / pin_demo.
-- E.164 formatted. Indexed (partial, excludes nulls) so the analytics page
-- can group by caller cheaply on the 30-day window.

alter table conversations
  add column if not exists caller_phone_e164 text;

create index if not exists idx_conversations_caller_phone
  on conversations(caller_phone_e164)
  where caller_phone_e164 is not null;

comment on column conversations.caller_phone_e164 is
  'E.164 caller number, populated from EL metadata.phone_call.from_phone_number for PSTN. Null for browser/PIN.';

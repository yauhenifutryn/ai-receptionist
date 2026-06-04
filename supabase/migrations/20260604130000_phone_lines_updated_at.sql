-- 20260604130000_phone_lines_updated_at.sql
-- Review follow-up to 20260604120000: phone_lines carries mutable state
-- (mode flips direct<->pin, status), so it gets the standard updated_at +
-- set_updated_at() trigger every other mutable table has (see init.sql).
-- Plus a column comment making the el_phone_number_id mode contract explicit.

alter table phone_lines
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_phone_lines_updated_at on phone_lines;
create trigger trg_phone_lines_updated_at
  before update on phone_lines
  for each row execute function set_updated_at();

comment on column phone_lines.el_phone_number_id is
  'ElevenLabs phone-number resource id for the REAL e164. Required in direct mode (agent bound here); unused in pin mode (routing goes through per-agent virtual resources on phone_line_agents).';

-- 20260604120000_phone_lines.sql
-- Demo phone line pool (Telnyx SIP → ElevenLabs). Spec:
-- docs/superpowers/specs/2026-06-04-clinic-demo-line-sip-design.md
--
--   • phone_lines        — one row per connected Telnyx DID
--   • phone_line_agents  — agents deployed on a line. 1 row = direct mode
--                          (native EL wiring, no PIN); 2+ rows = pin mode
--                          (TeXML IVR gathers agents.pin_code, bridges to the
--                          agent's virtual EL identifier).
-- RLS mirrors sms_send_failures: operator-select, service-role-write.

create table if not exists phone_lines (
  id uuid primary key default gen_random_uuid(),
  e164 text not null unique,
  provider text not null default 'telnyx',
  telnyx_number_id text,
  -- 'direct' (1 agent, native EL routing) | 'pin' (2+ agents, TeXML IVR)
  mode text not null default 'direct' check (mode in ('direct','pin')),
  -- EL phone-number resource id for the REAL e164 (used in direct mode)
  el_phone_number_id text,
  status text not null default 'active' check (status in ('active','released')),
  created_at timestamptz not null default now()
);

create table if not exists phone_line_agents (
  id uuid primary key default gen_random_uuid(),
  phone_line_id uuid not null references phone_lines(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  -- Virtual identifier bridged to in pin mode (null while line is direct).
  -- Never a dialable number; imported as its own EL phone-number resource.
  el_virtual_e164 text unique,
  el_virtual_phone_number_id text,
  created_at timestamptz not null default now(),
  unique (phone_line_id, agent_id)
);

create index if not exists idx_phone_line_agents_line
  on phone_line_agents(phone_line_id);
create index if not exists idx_phone_line_agents_agent
  on phone_line_agents(agent_id);

alter table phone_lines enable row level security;
alter table phone_line_agents enable row level security;

drop policy if exists phone_lines_select on phone_lines;
create policy phone_lines_select on phone_lines
  for select using (is_operator(auth.uid()));

drop policy if exists phone_line_agents_select on phone_line_agents;
create policy phone_line_agents_select on phone_line_agents
  for select using (is_operator(auth.uid()));

-- No insert/update policies: only service-role writes (API routes + scripts).

comment on table phone_lines is
  'Telnyx DIDs available as demo phone deployments. mode=direct routes the DID straight to one EL agent over SIP; mode=pin fronts the DID with a TeXML PIN IVR that bridges to per-agent virtual EL identifiers.';

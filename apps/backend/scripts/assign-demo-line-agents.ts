#!/usr/bin/env tsx
/**
 * Assign agents to the demo phone line from the CLI (same planner/effect
 * pipeline the dashboard assign API uses — apps/web/lib/phone-lines.ts).
 * Useful when wiring several agents at once instead of clicking through
 * /test/[agentId] panels.
 *
 * Usage:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/assign-demo-line-agents.ts <agent-uuid> [<agent-uuid> ...]
 *
 * Preconditions mirrored from the assign route:
 *   - line must exist and be provisioned (el_phone_number_id set);
 *   - when the line ends up in PIN mode, every assigned agent must have a
 *     6-digit pin_code (the IVR resolves callers by PIN).
 */
import { createClient } from "@supabase/supabase-js";
// NOTE: dynamic import with explicit .ts extension — the import crosses
// package roots (backend scripts → web lib, different module types), and
// static named imports fail the ESM binding check on the transpiled CJS
// output. The runtime namespace object carries all exports fine.
import type { LineContext, AgentRef } from "../../web/lib/phone-lines.ts";
const { planAssign, executeEffects } = await import("../../web/lib/phone-lines.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fqdnConnectionId = process.env.TELNYX_DEMO_FQDN_CONNECTION_ID;
const texmlAppId = process.env.TELNYX_DEMO_TEXML_APP_ID;
if (!supabaseUrl || !serviceKey || !fqdnConnectionId || !texmlAppId) {
  console.error(
    "env missing — need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELNYX_DEMO_FQDN_CONNECTION_ID, TELNYX_DEMO_TEXML_APP_ID",
  );
  process.exit(2);
}

const agentIds = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (agentIds.length === 0) {
  console.error("usage: assign-demo-line-agents.ts <agent-uuid> [<agent-uuid> ...]");
  process.exit(2);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: lines, error: lineErr } = await sb.from("phone_lines").select("*").limit(2);
if (lineErr) throw new Error(lineErr.message);
if (!lines || lines.length !== 1) {
  // One pool line is the current world; bail loudly if that assumption breaks.
  throw new Error(`expected exactly 1 phone_lines row, found ${lines?.length ?? 0}`);
}
const lineRow = lines[0];
if (!lineRow.el_phone_number_id || !lineRow.telnyx_number_id) {
  throw new Error("line_not_provisioned: el_phone_number_id/telnyx_number_id missing");
}
const line: LineContext = {
  lineId: lineRow.id,
  e164: lineRow.e164,
  telnyxNumberId: lineRow.telnyx_number_id,
  elPhoneNumberId: lineRow.el_phone_number_id,
  fqdnConnectionId,
  texmlAppId,
};
console.log(`line ${line.e164} (mode=${lineRow.mode})`);

for (const agentId of agentIds) {
  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("id, provider_agent_id, pin_code, tenants(name)")
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr) throw new Error(agentErr.message);
  if (!agent) throw new Error(`agent ${agentId} not found`);

  const { data: current, error: curErr } = await sb
    .from("phone_line_agents")
    .select("agent_id, agents(pin_code)")
    .eq("phone_line_id", line.lineId);
  if (curErr) throw new Error(curErr.message);
  const currentAgentIds = (current ?? []).map((r) => r.agent_id as string);

  if (currentAgentIds.includes(agent.id)) {
    console.log(`- ${tenantName(agent)} already assigned, skipping`);
    continue;
  }

  // PIN-mode preconditions (same checks the assign route enforces).
  const willBePinMode = currentAgentIds.length >= 1;
  if (willBePinMode) {
    if (!agent.pin_code) throw new Error(`agent_has_no_pin: ${tenantName(agent)}`);
    const existingWithoutPin = (current ?? []).filter((r) => {
      const a = r.agents as { pin_code: string | null } | { pin_code: string | null }[] | null;
      const pin = Array.isArray(a) ? a[0]?.pin_code : a?.pin_code;
      return !pin;
    });
    if (existingWithoutPin.length > 0) {
      throw new Error("existing_agent_has_no_pin: set PINs before flipping to PIN mode");
    }
  }

  const effects = planAssign({ currentAgentIds, newAgentId: agent.id });
  const agents = new Map<string, AgentRef>();
  agents.set(agent.id, { providerAgentId: agent.provider_agent_id });
  for (const r of current ?? []) {
    const { data: a } = await sb
      .from("agents")
      .select("provider_agent_id")
      .eq("id", r.agent_id)
      .single();
    if (a) agents.set(r.agent_id as string, { providerAgentId: a.provider_agent_id });
  }

  console.log(`- assigning ${tenantName(agent)} (${effects.map((e) => e.kind).join(" → ")})`);
  await executeEffects(effects, line, agents, sb);
  console.log(`  ok`);
}

const { data: final } = await sb
  .from("phone_lines")
  .select("e164, mode")
  .eq("id", line.lineId)
  .single();
const { data: finalAgents } = await sb
  .from("phone_line_agents")
  .select("el_virtual_e164, agents(pin_code, tenants(name))")
  .eq("phone_line_id", line.lineId);
console.log(`\nfinal: ${final?.e164} mode=${final?.mode}`);
for (const r of finalAgents ?? []) {
  const a = r.agents as unknown as { pin_code: string | null; tenants: { name: string } | null };
  console.log(
    `  ${a?.tenants?.name ?? "?"} | PIN ${a?.pin_code ?? "-"} | virtual ${r.el_virtual_e164 ?? "-"}`,
  );
}

function tenantName(agent: { tenants: unknown }): string {
  const t = agent.tenants as { name?: string } | { name?: string }[] | null;
  return (Array.isArray(t) ? t[0]?.name : t?.name) ?? "unknown tenant";
}

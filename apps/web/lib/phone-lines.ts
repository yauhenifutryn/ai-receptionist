// apps/web/lib/phone-lines.ts
// Demo-line assignment orchestration. planAssign/planUnassign are PURE — they
// emit an ordered effect list (unit-tested). executeEffects performs them
// against ElevenLabs + Telnyx + Supabase. Mode model (spec §Architecture):
//   1 agent  → direct: DID on FQDN connection, real EL resource bound to agent.
//   2+ agents → pin:   DID on TeXML app, each agent gets a virtual EL resource.

export type Effect =
  | { kind: "bind_real_resource"; agentId: string }
  | { kind: "ensure_virtual"; agentId: string }
  | { kind: "delete_virtual"; agentId: string }
  | { kind: "point_telnyx_to"; target: "fqdn" | "texml" }
  | { kind: "set_mode"; mode: "direct" | "pin" }
  | { kind: "insert_assignment"; agentId: string; needsVirtual: boolean }
  | { kind: "delete_assignment"; agentId: string };

export function planAssign(input: { currentAgentIds: string[]; newAgentId: string }): Effect[] {
  const { currentAgentIds, newAgentId } = input;
  if (currentAgentIds.includes(newAgentId)) throw new Error("agent already assigned to this line");
  if (currentAgentIds.length === 0) {
    return [
      { kind: "bind_real_resource", agentId: newAgentId },
      { kind: "point_telnyx_to", target: "fqdn" },
      { kind: "set_mode", mode: "direct" },
      { kind: "insert_assignment", agentId: newAgentId, needsVirtual: false },
    ];
  }
  // noUncheckedIndexedAccess types array[i] as string|undefined; the length
  // check guarantees presence but does not narrow the element type, so use
  // a checked local. (Defensive throw also documents the invariant.)
  const existingAgentId = currentAgentIds[0];
  if (currentAgentIds.length === 1 && existingAgentId !== undefined) {
    return [
      { kind: "ensure_virtual", agentId: existingAgentId },
      { kind: "ensure_virtual", agentId: newAgentId },
      { kind: "point_telnyx_to", target: "texml" },
      { kind: "set_mode", mode: "pin" },
      { kind: "insert_assignment", agentId: newAgentId, needsVirtual: true },
    ];
  }
  return [
    { kind: "ensure_virtual", agentId: newAgentId },
    { kind: "insert_assignment", agentId: newAgentId, needsVirtual: true },
  ];
}

export function planUnassign(input: {
  currentAgentIds: string[];
  removeAgentId: string;
}): Effect[] {
  const { currentAgentIds, removeAgentId } = input;
  if (!currentAgentIds.includes(removeAgentId)) throw new Error("agent not assigned to this line");
  const remaining = currentAgentIds.filter((id) => id !== removeAgentId);
  if (remaining.length === 0) {
    return [
      { kind: "delete_assignment", agentId: removeAgentId },
      { kind: "set_mode", mode: "direct" },
    ];
  }
  const survivor = remaining[0];
  if (remaining.length === 1 && survivor !== undefined) {
    return [
      { kind: "delete_assignment", agentId: removeAgentId },
      { kind: "delete_virtual", agentId: removeAgentId },
      { kind: "delete_virtual", agentId: survivor },
      { kind: "bind_real_resource", agentId: survivor },
      { kind: "point_telnyx_to", target: "fqdn" },
      { kind: "set_mode", mode: "direct" },
    ];
  }
  return [
    { kind: "delete_assignment", agentId: removeAgentId },
    { kind: "delete_virtual", agentId: removeAgentId },
  ];
}

// ---------------------------------------------------------------------------
// Effect execution (thin I/O glue — verified live, not unit-mocked).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LineContext {
  lineId: string;
  e164: string;
  telnyxNumberId: string;
  elPhoneNumberId: string; // EL resource of the REAL number
  fqdnConnectionId: string; // TELNYX_DEMO_FQDN_CONNECTION_ID
  texmlAppId: string; // TELNYX_DEMO_TEXML_APP_ID
}

/** agentId (our uuid) → provider (EL) agent id + the phone_line_agents row id. */
export interface AgentRef {
  providerAgentId: string;
  rowId: string;
}

/**
 * Per-request scratch for a virtual created during ensure_virtual but whose
 * phone_line_agents row does not exist yet (the first-flip case). Carried
 * forward to insert_assignment. Created INSIDE executeEffects so a mid-run
 * throw cannot leak partial state across requests (was a module-level Map).
 */
interface PendingVirtual {
  el_virtual_e164: string;
  el_virtual_phone_number_id: string;
}
type PendingVirtuals = Map<string, PendingVirtual>;

const EL = "https://api.elevenlabs.io/v1/convai";
const TX = "https://api.telnyx.com/v2";

async function elFetch(path: string, method: string, body?: unknown) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok)
    throw new Error(`EL ${method} ${path} → ${r.status} ${await r.text().catch(() => "")}`);
  return r.json().catch(() => ({}));
}

async function txFetch(path: string, method: string, body?: unknown) {
  const r = await fetch(`${TX}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok)
    throw new Error(`TX ${method} ${path} → ${r.status} ${await r.text().catch(() => "")}`);
  return r.json().catch(() => ({}));
}

/** Random never-dialable identifier; retried on unique-index collision. */
function randomVirtualE164(): string {
  const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  return `+48000${digits}`;
}

/**
 * Resolve an agentId to its provider id + row id, or throw a clear error.
 * Avoids silent `!` non-null assertions: a missing agent is a caller bug
 * (the route must pass a complete map), so fail loud with the offending id.
 */
function mustGet(agents: Map<string, AgentRef>, agentId: string): AgentRef {
  const ref = agents.get(agentId);
  if (!ref) throw new Error(`phone-lines: agent ${agentId} missing from agents map`);
  return ref;
}

/**
 * Perform an ordered effect list against EL + Telnyx + Supabase.
 *
 * @param effects  output of planAssign/planUnassign.
 * @param line     resolved line + Telnyx/EL ids and the two connection targets.
 * @param agents   every agentId referenced by the effects → its EL id + row id.
 * @param supabase service-role client (RLS is write-restricted to service role).
 */
export async function executeEffects(
  effects: Effect[],
  line: LineContext,
  agents: Map<string, AgentRef>,
  supabase: SupabaseClient,
): Promise<void> {
  // Request-scoped: lives and dies with this call frame. A throw mid-run
  // discards it instead of poisoning the next request.
  const pendingVirtuals: PendingVirtuals = new Map();

  for (const effect of effects) {
    switch (effect.kind) {
      case "bind_real_resource": {
        const { providerAgentId } = mustGet(agents, effect.agentId);
        await elFetch(`/phone-numbers/${line.elPhoneNumberId}`, "PATCH", {
          agent_id: providerAgentId,
        });
        break;
      }

      case "ensure_virtual": {
        await ensureVirtual(effect.agentId, line, agents, supabase, pendingVirtuals);
        break;
      }

      case "delete_virtual": {
        await deleteVirtual(effect.agentId, line, agents, supabase);
        break;
      }

      case "point_telnyx_to": {
        const connectionId = effect.target === "fqdn" ? line.fqdnConnectionId : line.texmlAppId;
        await txFetch(`/phone_numbers/${line.telnyxNumberId}`, "PATCH", {
          connection_id: connectionId,
        });
        break;
      }

      case "set_mode": {
        const { error } = await supabase
          .from("phone_lines")
          .update({ mode: effect.mode })
          .eq("id", line.lineId);
        if (error) throw new Error(`phone-lines: set_mode → ${error.message}`);
        break;
      }

      case "insert_assignment": {
        const pending = effect.needsVirtual ? pendingVirtuals.get(effect.agentId) : undefined;
        const row = {
          phone_line_id: line.lineId,
          agent_id: effect.agentId,
          el_virtual_e164: pending?.el_virtual_e164 ?? null,
          el_virtual_phone_number_id: pending?.el_virtual_phone_number_id ?? null,
        };
        const { error } = await supabase.from("phone_line_agents").insert(row);
        if (error) throw new Error(`phone-lines: insert_assignment → ${error.message}`);
        pendingVirtuals.delete(effect.agentId);
        break;
      }

      case "delete_assignment": {
        const { error } = await supabase
          .from("phone_line_agents")
          .delete()
          .eq("phone_line_id", line.lineId)
          .eq("agent_id", effect.agentId);
        if (error) throw new Error(`phone-lines: delete_assignment → ${error.message}`);
        break;
      }
    }
  }
}

/**
 * Idempotent virtual-resource creation. If the agent's row already carries an
 * el_virtual_e164 we do nothing. Otherwise: create the EL resource for a
 * never-dialable E.164, bind the agent to it, then persist — UPDATE the row if
 * it exists, else stash in the request-scoped pending map for insert_assignment.
 */
async function ensureVirtual(
  agentId: string,
  line: LineContext,
  agents: Map<string, AgentRef>,
  supabase: SupabaseClient,
  pendingVirtuals: PendingVirtuals,
): Promise<void> {
  const { providerAgentId, rowId } = mustGet(agents, agentId);

  // Already provisioned (row exists with a virtual)? Idempotent no-op.
  const { data: existing, error: selErr } = await supabase
    .from("phone_line_agents")
    .select("el_virtual_e164")
    .eq("id", rowId)
    .maybeSingle();
  if (selErr) throw new Error(`phone-lines: ensure_virtual select → ${selErr.message}`);
  if (existing?.el_virtual_e164) return;
  if (pendingVirtuals.has(agentId)) return;

  const virtualE164 = randomVirtualE164();
  const created = await elFetch(`/phone-numbers`, "POST", {
    phone_number: virtualE164,
    label: `demo-line virtual → ${providerAgentId}`,
    provider: "sip_trunk",
    inbound_trunk_config: { media_encryption: "allowed" },
  });
  const elVirtualPhoneNumberId = String(created?.phone_number_id ?? created?.id ?? "");

  // Bind the agent to its virtual resource.
  await elFetch(`/phone-numbers/${elVirtualPhoneNumberId}`, "PATCH", {
    agent_id: providerAgentId,
  });

  // Row may or may not exist yet. The first-flip case (existing agent being
  // promoted to pin) has a row; the new agent's row is inserted later.
  if (existing) {
    const { error } = await supabase
      .from("phone_line_agents")
      .update({
        el_virtual_e164: virtualE164,
        el_virtual_phone_number_id: elVirtualPhoneNumberId,
      })
      .eq("id", rowId);
    if (error) throw new Error(`phone-lines: ensure_virtual update → ${error.message}`);
  } else {
    pendingVirtuals.set(agentId, {
      el_virtual_e164: virtualE164,
      el_virtual_phone_number_id: elVirtualPhoneNumberId,
    });
  }
}

/**
 * Remove an agent's virtual resource and null the two columns. The EL DELETE is
 * best-effort: a failure leaves a visible orphan in the EL dashboard rather than
 * blocking the mode flip, which must complete to keep the line consistent.
 */
async function deleteVirtual(
  agentId: string,
  line: LineContext,
  agents: Map<string, AgentRef>,
  supabase: SupabaseClient,
): Promise<void> {
  const { rowId } = mustGet(agents, agentId);

  const { data: row, error: selErr } = await supabase
    .from("phone_line_agents")
    .select("el_virtual_phone_number_id")
    .eq("id", rowId)
    .maybeSingle();
  if (selErr) throw new Error(`phone-lines: delete_virtual select → ${selErr.message}`);

  const elId = row?.el_virtual_phone_number_id as string | null | undefined;
  if (elId) {
    try {
      await elFetch(`/phone-numbers/${elId}`, "DELETE");
    } catch (e) {
      // Orphan stays visible in the EL dashboard; do not block the flip.
      console.warn(`phone-lines: delete_virtual EL DELETE failed (orphan left): ${String(e)}`);
    }
  }

  const { error } = await supabase
    .from("phone_line_agents")
    .update({ el_virtual_e164: null, el_virtual_phone_number_id: null })
    .eq("id", rowId);
  if (error) throw new Error(`phone-lines: delete_virtual update → ${error.message}`);

  // 'line' is part of the executor's shared signature; referenced for parity
  // with sibling helpers even though delete keys off the stable row id.
  void line;
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";
import {
  planAssign,
  planUnassign,
  executeEffects,
  type LineContext,
  type AgentRef,
} from "@/lib/phone-lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["assign", "unassign"]),
  lineId: z.string().uuid(),
  providerAgentId: z.string().min(8).max(80),
});

/** Operator-only: assign or unassign an agent on a demo phone line. */
export async function POST(req: NextRequest) {
  // 1. Auth gate.
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) return NextResponse.json(operator.body, { status: operator.status });

  // Body validation.
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { action, lineId, providerAgentId } = parsed.data;

  // 2. Env guard.
  const fqdnConnectionId = process.env.TELNYX_DEMO_FQDN_CONNECTION_ID;
  const texmlAppId = process.env.TELNYX_DEMO_TEXML_APP_ID;
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  const elApiKey = process.env.ELEVENLABS_API_KEY;
  if (!fqdnConnectionId || !texmlAppId || !telnyxApiKey || !elApiKey) {
    return NextResponse.json({ error: "demo_line_env_missing" }, { status: 500 });
  }

  // Use operator-scoped client for reads (SELECT policies on both tables grant
  // access to operators). Service-role client is used only for executeEffects
  // writes (no insert/update policies exist for the user JWT).
  const readsDb = operator.supabase;

  // 3. Load line by id; must be active.
  const { data: lineRow, error: lineErr } = await readsDb
    .from("phone_lines")
    .select("id, e164, telnyx_number_id, el_phone_number_id")
    .eq("id", lineId)
    .eq("status", "active")
    .maybeSingle();
  if (lineErr) {
    return NextResponse.json(
      { error: "line_lookup_failed", message: lineErr.message },
      { status: 500 },
    );
  }
  if (!lineRow) {
    return NextResponse.json({ error: "line_not_found", lineId }, { status: 404 });
  }

  // Guard: both Telnyx + EL ids must be recorded (set by the seed script).
  const telnyxNumberId = lineRow.telnyx_number_id as string | null;
  const elPhoneNumberId = lineRow.el_phone_number_id as string | null;
  if (!telnyxNumberId || !elPhoneNumberId) {
    return NextResponse.json(
      {
        error: "line_not_provisioned",
        message: "telnyx_number_id or el_phone_number_id is null; run the line seed script first.",
      },
      { status: 500 },
    );
  }

  // 4. Load agent row by providerAgentId.
  const { data: agentRow, error: agentErr } = await readsDb
    .from("agents")
    .select("id, provider_agent_id, pin_code")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (agentErr) {
    return NextResponse.json(
      { error: "agent_lookup_failed", message: agentErr.message },
      { status: 500 },
    );
  }
  if (!agentRow) {
    return NextResponse.json({ error: "agent_not_found", providerAgentId }, { status: 404 });
  }

  // 5. Load current assignments.
  const { data: assignmentRows, error: assignErr } = await readsDb
    .from("phone_line_agents")
    .select("agent_id, agents(provider_agent_id, pin_code)")
    .eq("phone_line_id", lineId);
  if (assignErr) {
    return NextResponse.json(
      { error: "assignments_lookup_failed", message: assignErr.message },
      { status: 500 },
    );
  }

  // Build currentAgentIds and a complete agents map.
  // Supabase returns the nested join as a single object (FK to PK) or null.
  const currentAgentIds: string[] = [];
  const agents = new Map<string, AgentRef>();

  for (const row of assignmentRows ?? []) {
    const agentId = row.agent_id as string;
    currentAgentIds.push(agentId);
    const nested = Array.isArray(row.agents) ? row.agents[0] : row.agents;
    if (nested) {
      agents.set(agentId, {
        providerAgentId: nested.provider_agent_id as string,
      });
    }
  }

  // Also add the target agent to the map (may not be in currentAgentIds yet).
  const targetAgentId = agentRow.id as string;
  agents.set(targetAgentId, { providerAgentId: agentRow.provider_agent_id as string });

  // 6. PIN preconditions.
  if (action === "assign") {
    if (currentAgentIds.length >= 1) {
      // The new agent needs a PIN (it will be reachable behind the IVR after flip).
      const targetPinCode = agentRow.pin_code as string | null;
      if (!targetPinCode) {
        return NextResponse.json(
          {
            error: "agent_has_no_pin",
            message: "Generate a demo PIN for this agent first.",
          },
          { status: 409 },
        );
      }
      // The existing agent(s) also need PINs: when the line flips from direct→pin
      // (1→2 case) the existing agent becomes reachable only via its PIN digit.
      for (const row of assignmentRows ?? []) {
        const nested = Array.isArray(row.agents) ? row.agents[0] : row.agents;
        const existingPinCode = (nested?.pin_code as string | null | undefined) ?? null;
        if (!existingPinCode) {
          const existingProviderAgentId =
            (nested?.provider_agent_id as string | undefined) ?? (row.agent_id as string);
          return NextResponse.json(
            {
              error: "existing_agent_has_no_pin",
              providerAgentId: existingProviderAgentId,
              message: `Agent ${existingProviderAgentId} has no PIN. Generate one before adding a second agent to this line.`,
            },
            { status: 409 },
          );
        }
      }
    }
  }

  // 7. Build LineContext.
  const lineContext: LineContext = {
    lineId,
    e164: lineRow.e164 as string,
    telnyxNumberId,
    elPhoneNumberId,
    fqdnConnectionId,
    texmlAppId,
  };

  // 8. Plan + execute.
  // Service-role client for writes: phone_line_agents and phone_lines have no
  // insert/update policies — only service-role can write them.
  const writesDb = getServiceRoleSupabase();

  let effects;
  try {
    effects =
      action === "assign"
        ? planAssign({ currentAgentIds, newAgentId: targetAgentId })
        : planUnassign({ currentAgentIds, removeAgentId: targetAgentId });
  } catch (e) {
    return NextResponse.json(
      { error: "plan_conflict", message: (e as Error).message },
      { status: 409 },
    );
  }

  try {
    await executeEffects(effects, lineContext, agents, writesDb);
  } catch (e) {
    return NextResponse.json(
      { error: "assignment_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // 9. Derive post-action mode from counts.
  const postActionCount =
    action === "assign"
      ? currentAgentIds.length + 1
      : currentAgentIds.filter((id) => id !== targetAgentId).length;
  const mode: "direct" | "pin" = postActionCount >= 2 ? "pin" : "direct";

  return NextResponse.json({ ok: true, mode });
}

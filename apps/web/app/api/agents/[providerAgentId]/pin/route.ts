import { NextResponse, type NextRequest } from "next/server";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * GET: returns the current pin_code (or null) for an agent.
 * POST: generates a fresh 4-digit PIN and saves it on agents.pin_code,
 *       retrying up to 5 times on uniqueness conflict.
 *
 * Operator-only — PIN gates the public /demo/<agentId>?pin=X route.
 */

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;
  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("agents")
    .select("pin_code")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "lookup_failed", message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }
  return NextResponse.json({ pin: data.pin_code ?? null });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;
  const sb = getServiceRoleSupabase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pin = generatePin();
    const { data, error } = await sb
      .from("agents")
      .update({ pin_code: pin })
      .eq("provider_agent_id", providerAgentId)
      .select("provider_agent_id, pin_code")
      .maybeSingle();
    if (!error && data) {
      return NextResponse.json({ pin: data.pin_code });
    }
    // 23505 = postgres unique violation. Try a fresh PIN.
    if (error && (error as { code?: string }).code === "23505") {
      continue;
    }
    if (error) {
      return NextResponse.json(
        { error: "pin_assign_failed", message: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "pin_collision_exhausted" }, { status: 500 });
}

import { NextResponse, type NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * F2 + F7: 6-digit PIN (1,000,000-value space) generated with crypto.randomInt
 * instead of Math.random. Combined with the rate limit on `?pin=` parameter
 * routes (see apps/web/app/api/conversations/route.ts), this makes the demo
 * gate practically un-brute-forceable.
 *
 * Old 4-digit PINs in the DB stay valid for the operator who shared them; a
 * fresh POST replaces them with 6-digit. scripts/rotate-pins.ts can rotate
 * all at once when convenient.
 */
function generatePin(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * GET: returns the current pin_code (or null) for an agent.
 * POST: generates a fresh 6-digit PIN and saves it on agents.pin_code,
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

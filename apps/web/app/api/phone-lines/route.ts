import { NextResponse } from "next/server";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator-only: the demo-line pool with current assignments. */
export async function GET() {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) return NextResponse.json(operator.body, { status: operator.status });

  const { data: lines, error } = await operator.supabase
    .from("phone_lines")
    .select(
      "id, e164, mode, status, created_at, phone_line_agents(agent_id, el_virtual_e164, agents(provider_agent_id, pin_code, tenants(display_name)))",
    )
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "phone_lines_query_failed", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ lines: lines ?? [] });
}

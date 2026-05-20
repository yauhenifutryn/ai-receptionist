import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS =
  "id, conversation_id, tenant_id, agent_id, provider_agent_id, source, direction, " +
  "started_at, ended_at, duration_seconds, end_reason, consent_flag, consent_decision, " +
  "caller_language, appointment_category, escalated, escalation_reason, booked_booking_id, " +
  "tool_call_count, tool_error_count, raw_jsonb, finalized_at, created_at, updated_at";

/**
 * GET /api/conversations/[conversationId]
 *
 * Two access paths:
 *   1. PIN path  — `?pin=...&agentId=...`: service-role + manual PIN check.
 *                  Only rows with source=pin_demo for that agent are returned.
 *   2. Auth path — uses the user-JWT client; RLS scopes the row to operator
 *                  (cross-tenant) or tenant_member (own tenant) access.
 *
 * Both paths return 404 when no row matches, so an unauthorised caller cannot
 * distinguish "wrong id" from "no permission".
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await ctx.params;
  const url = req.nextUrl;
  const pin = url.searchParams.get("pin");
  const agentId = url.searchParams.get("agentId");

  if (pin && agentId) {
    const service = getServiceRoleSupabase();
    const { data: agentRow } = await service
      .from("agents")
      .select("pin_code")
      .eq("provider_agent_id", agentId)
      .maybeSingle();
    if (!agentRow || agentRow.pin_code !== pin) {
      return NextResponse.json({ error: "pin_mismatch" }, { status: 403 });
    }
    const { data } = await service
      .from("conversations")
      .select(COLS)
      .eq("conversation_id", conversationId)
      .eq("provider_agent_id", agentId)
      .eq("source", "pin_demo")
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ row: data });
  }

  const userSupabase = await getUserSupabase();
  const { data: userData } = await userSupabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await userSupabase
    .from("conversations")
    .select(COLS)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ row: data });
}

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";
import { checkRateLimit, callerIp } from "@/lib/rate-limit";

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
export async function GET(req: NextRequest, ctx: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await ctx.params;
  const url = req.nextUrl;
  const pin = url.searchParams.get("pin");
  const agentId = url.searchParams.get("agentId");

  if (pin && agentId) {
    // F2: rate limit (agent, IP) to defeat brute force on the PIN.
    const rl = checkRateLimit({
      key: `pin:${agentId}:${callerIp(req)}`,
      maxAttempts: 5,
      windowSec: 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
      );
    }
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
    const enriched = await ensureTranscript(
      service,
      data as unknown as Record<string, unknown>,
      conversationId,
    );
    return NextResponse.json({ row: enriched });
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
  const enriched = await ensureTranscript(
    userSupabase,
    data as unknown as Record<string, unknown>,
    conversationId,
  );
  return NextResponse.json({ row: enriched });
}

/**
 * Fallback for sessions where the finalize POST never reached EL (browser
 * closed too fast, lazy retry not yet run, or EL hasn't ingested the call
 * yet). If raw_jsonb.transcript is empty, synthesize one from the live
 * turn-stream we captured in test_transcripts. The same row shape the
 * drill-down UI expects.
 */
async function ensureTranscript(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  conversationId: string,
): Promise<Record<string, unknown>> {
  const raw = (row.raw_jsonb ?? null) as { transcript?: unknown[] } | null;
  if (raw && Array.isArray(raw.transcript) && raw.transcript.length > 0) return row;

  const { data: turnsRaw } = await supabase
    .from("test_transcripts")
    .select("role, text, recorded_at")
    .eq("conversation_id", conversationId)
    .order("recorded_at", { ascending: true })
    .limit(500);
  const turns = (turnsRaw ?? []) as Array<{ role: string; text: string; recorded_at: string }>;
  const first = turns[0];
  if (!first) return row;

  const startedAt = (row.started_at as string | undefined) ?? first.recorded_at;
  const startMs = new Date(startedAt).getTime();
  const synthesized = turns.map((t) => ({
    role: t.role,
    message: t.text,
    time_in_call_secs: Math.max(
      0,
      Math.round((new Date(t.recorded_at).getTime() - startMs) / 1000),
    ),
  }));
  return {
    ...row,
    raw_jsonb: { ...(raw ?? {}), transcript: synthesized, _fallback: "test_transcripts" },
  };
}

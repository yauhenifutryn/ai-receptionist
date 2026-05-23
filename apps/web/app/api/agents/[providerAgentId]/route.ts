import { NextResponse, type NextRequest } from "next/server";
import { ElevenLabsConvAIProvider } from "@ai-receptionist/backend/orchestration";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * DELETE: removes the agent from ElevenLabs AND from our Supabase row.
 *
 * Cascade behavior on the DB side:
 *   • agents.id FK on bookings → on delete set null (bookings preserved but unlinked)
 *   • agents.id FK on consent_log → on delete set null
 *   • agents.id FK on test_transcripts → on delete cascade
 *
 * EL delete is permanent. There is no undo. The operator UI must confirm
 * before calling this — we don't double-confirm server-side because the
 * operator is already authenticated and the action is per-agent scoped.
 *
 * If the EL delete fails (e.g. agent already removed upstream), we still
 * proceed to delete the local row so the dashboard reflects reality.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  let elError: string | undefined;
  if (apiKey) {
    const provider = new ElevenLabsConvAIProvider({ apiKey });
    try {
      await provider.deleteAgent({ agentId: providerAgentId });
    } catch (e) {
      // Tolerate upstream-not-found (404). Surface other errors but still
      // proceed to delete the local row — the dashboard should not get stuck
      // pointing at an EL agent we can't address.
      elError = (e as Error).message;
    }
  }

  const sb = getServiceRoleSupabase();
  const { data: agentRow, error: lookupError } = await sb
    .from("agents")
    .select("id, tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json(
      { error: "lookup_failed", message: lookupError.message },
      { status: 500 },
    );
  }
  if (!agentRow) {
    return NextResponse.json(
      { ok: true, elError, dbDeleted: false, message: "agent row not found" },
      { status: 200 },
    );
  }

  const { error: delAgentError } = await sb.from("agents").delete().eq("id", agentRow.id);
  if (delAgentError) {
    return NextResponse.json(
      {
        error: "agent_delete_failed",
        message: delAgentError.message,
        elError,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    elError: elError ?? null,
    dbDeleted: true,
  });
}

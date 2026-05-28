import { type NextRequest } from "next/server";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/drafts/[id] — discard an in-progress draft. No cloud cleanup
 * needed: a draft has no ElevenLabs agent or KB document yet (those only
 * exist after Provision). RLS enforces operator-only; any operator may
 * delete any draft (no patient PII, shared workspace).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return Response.json({ error: operator.body.error }, { status: operator.status });
  }
  const { id } = await ctx.params;
  const { error } = await operator.supabase.from("provision_drafts").delete().eq("id", id);
  if (error) {
    return Response.json({ error: "draft_delete_failed", message: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

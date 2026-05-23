import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().max(320),
});

/**
 * POST /api/agents/[providerAgentId]/owner-invite
 *
 * Operator-only. Adds a row to `tenant_invitations` so the named email is
 * permitted to request a magic-link OTP and, on first verify, gets
 * materialized into `tenant_members` for that agent's tenant.
 *
 * Returns:
 *   - 200 ok        — invitation upserted (idempotent on (tenant_id, email)).
 *   - 401           — no Supabase session.
 *   - 403 forbidden — caller is not in operator_emails.
 *   - 404 agent_not_found — provider_agent_id does not resolve to any agent row.
 *   - 409 email_is_operator — invited email is itself an operator (avoid the
 *                            role-conflict where the OTP flow would treat them
 *                            as operator rather than tenant owner).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ providerAgentId: string }> },
) {
  const { providerAgentId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Operator gate.
  const userSupabase = await getUserSupabase();
  const { data: userData } = await userSupabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getServiceRoleSupabase();
  const { data: op } = await service
    .from("operator_emails")
    .select("email")
    .eq("email", userData.user.email)
    .maybeSingle();
  if (!op) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Reject if the invitee is itself an operator.
  const { data: collides } = await service
    .from("operator_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (collides) {
    return NextResponse.json({ error: "email_is_operator" }, { status: 409 });
  }

  // Resolve tenant from agent.
  const { data: agentRow } = await service
    .from("agents")
    .select("tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (!agentRow) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  const { error } = await service.from("tenant_invitations").upsert(
    {
      tenant_id: agentRow.tenant_id,
      email,
      role: "owner",
      invited_by_operator: userData.user.id,
    },
    { onConflict: "tenant_id,email", ignoreDuplicates: false },
  );
  if (error) {
    // Don't surface raw Supabase message; it can leak schema or constraint detail.
    console.error("[owner-invite] tenant_invitations upsert failed:", error.message);
    return NextResponse.json({ error: "invitation_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

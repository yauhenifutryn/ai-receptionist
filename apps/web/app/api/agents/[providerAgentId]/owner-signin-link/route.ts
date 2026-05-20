import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().max(320),
});

/**
 * POST /api/agents/[providerAgentId]/owner-signin-link
 *
 * Operator-only. Generates a one-time magic-link URL the operator can copy
 * and side-channel to the prospect (Slack / WhatsApp / their own mailbox).
 * This is the manual-delivery escape hatch while Resend custom-domain
 * delivery is not yet configured — `onboarding@resend.dev` only ships to
 * Resend-authorized addresses, so a real prospect can't receive an OTP by
 * email. The action_link from supabase.auth.admin.generateLink lets the
 * invitee click straight through to /owner/conversations as themselves.
 *
 * Also upserts the `tenant_invitations` row (idempotent on (tenant_id, email))
 * so the materialization-on-first-verify path in /api/auth/verify-otp still
 * works if the operator skipped the regular "Invite owner" button.
 *
 * Security:
 *   - 409 if the invited email is in operator_emails. Issuing a magiclink
 *     to an operator would let them sign in as tenant-owner, mis-routing
 *     them through the access-grant logic. Defense in depth.
 *   - The returned URL is NOT logged anywhere persistent. Generate, return,
 *     discard. Treat it like a temporary password on the operator side.
 *
 * Returns:
 *   - 200 ok   — { ok: true, url, expires_at }
 *   - 400      — validation_failed
 *   - 401      — no session
 *   - 403      — caller is not in operator_emails
 *   - 404      — agent_not_found
 *   - 409      — email_is_operator
 *   - 500      — invitation_upsert_failed | generate_link_failed
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

  // Reject if the invitee is itself an operator (defense in depth — same
  // guard as /owner-invite).
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

  // Record the invitation (idempotent). Mirror /owner-invite so the row
  // exists even when operator goes straight to "generate link".
  const { error: upsertErr } = await service.from("tenant_invitations").upsert(
    {
      tenant_id: agentRow.tenant_id,
      email,
      role: "owner",
      invited_by_operator: userData.user.id,
    },
    { onConflict: "tenant_id,email", ignoreDuplicates: false },
  );
  if (upsertErr) {
    return NextResponse.json(
      { error: "invitation_upsert_failed", message: upsertErr.message },
      { status: 500 },
    );
  }

  // Derive the site base URL. Prefer NEXT_PUBLIC_SITE_URL (explicit prod
  // override), fall back to the request origin so Vercel preview deploys
  // and localhost work without configuration.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  const redirectTo = `${siteUrl}/owner/conversations`;

  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      {
        error: "generate_link_failed",
        message: linkErr?.message ?? "action_link missing from generateLink response",
      },
      { status: 500 },
    );
  }

  // Supabase's generateLink response doesn't include an explicit expires_at;
  // the default magic-link TTL is 1 hour (configurable in dashboard, default
  // 3600s). Surface as a human-readable hint, not a hard timestamp.
  return NextResponse.json({
    ok: true,
    url: linkData.properties.action_link,
    expires_at: "approximately 1 hour",
  });
}

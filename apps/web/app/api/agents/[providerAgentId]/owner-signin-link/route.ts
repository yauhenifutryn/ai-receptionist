import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email().max(320),
});

/** Outer-token TTL — independent of Supabase's 1h action_link TTL. */
const SIGNIN_TOKEN_TTL_DAYS = 14;

/**
 * POST /api/agents/[providerAgentId]/owner-signin-link
 *
 * Operator-only. Mints a long-TTL (14 day) outer token wrapped around
 * Supabase's short-lived action_link. The operator copies the URL and
 * side-channels it to a prospect (Slack / WhatsApp / their own mailbox).
 * Prospect clicks any time in the 14-day window → /auth/owner-link
 * validates the outer token, mints a fresh 1h action_link at click time,
 * and 302-redirects to it. The Supabase token thus stays short-lived
 * (security) while the outer URL survives back-and-forth (UX).
 *
 * This is the manual-delivery escape hatch while Resend custom-domain
 * delivery is not yet configured — `onboarding@resend.dev` only ships to
 * Resend-authorized addresses, so a real prospect can't receive an OTP by
 * email. Once Resend custom-domain is live, the regular Invite-owner
 * button is the right path. This one stays useful for ad-hoc shares.
 *
 * Also upserts the `tenant_invitations` row (idempotent on (tenant_id, email))
 * so the materialization-on-first-verify path in /api/auth/verify-otp still
 * works if the operator skipped the regular "Invite owner" button.
 *
 * Security:
 *   - 409 if the invited email is in operator_emails — issuing a magiclink
 *     to an operator would mis-route them through tenant-owner access logic.
 *   - The outer token is opaque (uuid v4), DB-stored, single-use, expires
 *     after 14 days.
 *   - Operator regenerating rotates the token (old one stops working).
 *   - The returned URL is NOT logged anywhere persistent.
 *
 * Returns:
 *   - 200 ok   — { ok: true, url, expires_at: ISO string }
 *   - 400      — validation_failed
 *   - 401      — no session
 *   - 403      — caller is not in operator_emails
 *   - 404      — agent_not_found
 *   - 409      — email_is_operator
 *   - 500      — invitation_upsert_failed | token_persist_failed
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

  // Mint a fresh outer token. Rotating on regenerate (clear consumed-at
  // so a second click on a previously-used invitation works again).
  const signinToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SIGNIN_TOKEN_TTL_DAYS * 86400 * 1000);

  const { error: upsertErr } = await service.from("tenant_invitations").upsert(
    {
      tenant_id: agentRow.tenant_id,
      email,
      role: "owner",
      invited_by_operator: userData.user.id,
      signin_token: signinToken,
      signin_token_expires_at: expiresAt.toISOString(),
      signin_token_consumed_at: null,
    },
    { onConflict: "tenant_id,email", ignoreDuplicates: false },
  );
  if (upsertErr) {
    return NextResponse.json(
      { error: "invitation_upsert_failed", message: upsertErr.message },
      { status: 500 },
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const url = `${siteUrl}/auth/owner-link?token=${encodeURIComponent(signinToken)}`;

  return NextResponse.json({
    ok: true,
    url,
    expires_at: expiresAt.toISOString(),
    ttl_days: SIGNIN_TOKEN_TTL_DAYS,
  });
}

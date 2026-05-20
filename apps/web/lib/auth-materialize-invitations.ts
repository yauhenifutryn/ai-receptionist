import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Convert any pending `tenant_invitations` rows for this email into real
 * `tenant_members` rows. Idempotent — re-running after the rows already exist
 * is a no-op, so it's safe to call on every successful sign-in.
 *
 * Called from BOTH /auth/callback (magic-link path) AND /api/auth/verify-otp
 * (OTP-code path). Without this, an owner who clicks a magic-link from
 * /api/agents/[id]/owner-signin-link gets signed in but lands on
 * /auth/access-pending because no tenant_members row exists yet.
 *
 * Failures swallowed — sign-in must not block on materialization. A later
 * sign-in will retry. Caller should log if needed.
 */
export async function materializePendingInvitations(
  service: SupabaseClient,
  email: string,
  uid: string,
): Promise<{ materialized: number }> {
  const lower = email.toLowerCase();

  const { data: invites } = await service
    .from("tenant_invitations")
    .select("id, tenant_id, role")
    .eq("email", lower)
    .is("consumed_at", null);
  if (!invites || invites.length === 0) return { materialized: 0 };

  let count = 0;
  for (const inv of invites) {
    const { error: memberErr } = await service.from("tenant_members").upsert(
      { tenant_id: inv.tenant_id, user_id: uid, role: inv.role },
      { onConflict: "tenant_id,user_id" },
    );
    if (memberErr) continue;
    await service
      .from("tenant_invitations")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", inv.id);
    count++;
  }
  return { materialized: count };
}

import { getUserSupabase } from "@/lib/supabase-server";

/**
 * Shared owner-scope resolver. Three /api/owner/* routes (kb, voice, settings)
 * walk the same chain: user session → tenant_members → first agent for tenant.
 * Pack A flagged the duplication; settings (item 7) is the third caller, so
 * the resolver lives here. RLS scopes tenant_members to the signed-in user,
 * so we don't need an explicit .eq("user_id", uid).
 */

export interface OwnerAgentContext {
  tenantId: string;
  providerAgentId: string;
}

export type OwnerAgentResolution =
  | { ok: true; ctx: OwnerAgentContext }
  | { ok: false; status: number; body: { error: string } };

export async function resolveOwnerAgent(): Promise<OwnerAgentResolution> {
  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, status: 401, body: { error: "unauthenticated" } };
  }
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return { ok: false, status: 403, body: { error: "no_tenant_membership" } };
  }
  const { data: agent } = await supabase
    .from("agents")
    .select("provider_agent_id")
    .eq("tenant_id", membership.tenant_id)
    .limit(1)
    .maybeSingle();
  if (!agent?.provider_agent_id) {
    return { ok: false, status: 404, body: { error: "no_agent_for_tenant" } };
  }
  return {
    ok: true,
    ctx: {
      tenantId: membership.tenant_id as string,
      providerAgentId: agent.provider_agent_id as string,
    },
  };
}

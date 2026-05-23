import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantBinding } from "../tools/repository.js";

/**
 * Shared agent → tenant resolution used by both the tools repository
 * (booking writes) and the post-call repository (consent + transcript +
 * conversation writes). One source of truth so a future schema change to
 * `agents` only needs one update.
 */
export async function resolveTenantByAgent(
  client: SupabaseClient,
  providerAgentId: string,
): Promise<TenantBinding | null> {
  const { data, error } = await client
    .from("agents")
    .select("id, tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (error) throw new Error(`agents lookup failed: ${error.message}`, { cause: error });
  if (!data) return null;
  return { tenantId: data.tenant_id, agentRowId: data.id };
}

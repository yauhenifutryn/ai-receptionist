import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnerStatus = "active" | "pending";

export interface OwnerRow {
  email: string;
  status: OwnerStatus;
  // active rows
  user_id?: string;
  signed_in_at?: string | null;
  member_since?: string;
  // pending rows
  invitation_id?: string;
  invited_at?: string;
  signin_token_expires_at?: string | null;
  signin_token_consumed_at?: string | null;
}

export interface ListOwnersResult {
  ok: true;
  owners: OwnerRow[];
}

export interface ListOwnersError {
  ok: false;
  status: number;
  error: string;
}

/**
 * Pure handler for the owners-list endpoint.
 *
 * Merges two sources:
 *   1. `get_tenant_owners(p_tenant_id)` RPC — active tenant_members joined
 *      with auth.users for email + last_sign_in_at.
 *   2. `tenant_invitations` rows where consumed_at IS NULL — pending invites.
 *
 * If an invitation's email matches an active member's email, the active
 * record wins (we don't surface a duplicate pending row). The remaining
 * pending rows are listed below the actives.
 *
 * Sort: active first (alphabetical by email), then pending (newest invited
 * first).
 *
 * The caller is responsible for the operator gate. This handler is pure
 * over the Supabase client (service-role only — both reads bypass RLS by
 * design).
 */
export async function handleListOwners(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<ListOwnersResult | ListOwnersError> {
  // 1. Active members via RPC.
  const { data: activeRaw, error: activeErr } = await supabase.rpc("get_tenant_owners", {
    p_tenant_id: tenantId,
  });
  if (activeErr) {
    return { ok: false, status: 500, error: activeErr.message };
  }

  // 2. Pending invitations (consumed_at IS NULL).
  const { data: pendingRaw, error: pendingErr } = await supabase
    .from("tenant_invitations")
    .select("id, email, created_at, signin_token_expires_at, signin_token_consumed_at, consumed_at")
    .eq("tenant_id", tenantId)
    .is("consumed_at", null);
  if (pendingErr) {
    return { ok: false, status: 500, error: pendingErr.message };
  }

  const activeRows = (activeRaw ?? []) as Array<{
    user_id: string;
    email: string;
    role: string;
    member_since: string;
    last_sign_in_at: string | null;
  }>;
  const pendingRows = (pendingRaw ?? []) as Array<{
    id: string;
    email: string;
    created_at: string;
    signin_token_expires_at: string | null;
    signin_token_consumed_at: string | null;
  }>;

  const activeEmails = new Set(activeRows.map((r) => r.email.toLowerCase()));

  const active: OwnerRow[] = activeRows
    .map((r) => ({
      email: r.email,
      status: "active" as const,
      user_id: r.user_id,
      signed_in_at: r.last_sign_in_at,
      member_since: r.member_since,
    }))
    .sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));

  const pending: OwnerRow[] = pendingRows
    .filter((r) => !activeEmails.has(r.email.toLowerCase()))
    .map((r) => ({
      email: r.email,
      status: "pending" as const,
      invitation_id: r.id,
      invited_at: r.created_at,
      signin_token_expires_at: r.signin_token_expires_at,
      signin_token_consumed_at: r.signin_token_consumed_at,
    }))
    .sort((a, b) => new Date(b.invited_at ?? 0).getTime() - new Date(a.invited_at ?? 0).getTime());

  return { ok: true, owners: [...active, ...pending] };
}

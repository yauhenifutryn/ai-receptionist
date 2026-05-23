import { NextResponse, type NextRequest } from "next/server";
import { handleListOwners } from "@ai-receptionist/backend/owners";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * GET /api/agents/[providerAgentId]/owners
 *
 * Operator-only. Returns a merged list of currently-active tenant_members
 * and still-pending tenant_invitations for this agent's tenant. The pure
 * merging/sorting logic lives in
 * `@ai-receptionist/backend/owners.handleListOwners` so it can be unit-
 * tested without a live DB. This route is the thin wrapper: operator gate,
 * provider_agent_id → tenant_id resolve, delegate, JSON-serialize.
 *
 * Why two queries (RPC + table read) rather than one big join:
 *   - tenant_invitations is plain PostgREST; tenant_members needs auth.users
 *     for the email + last_sign_in_at, which only a SECURITY DEFINER RPC can
 *     expose. Splitting the two avoids a join that PostgREST cannot do via
 *     the service-role client.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const gate = await getOperatorOrJsonError();
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }
  const { providerAgentId } = await params;

  const service = getServiceRoleSupabase();
  const { data: agentRow, error: lookupErr } = await service
    .from("agents")
    .select("tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", message: lookupErr.message },
      { status: 500 },
    );
  }
  if (!agentRow) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  const result = await handleListOwners(agentRow.tenant_id, service);
  if (!result.ok) {
    return NextResponse.json(
      { error: "list_failed", message: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ owners: result.owners });
}

/**
 * DELETE /api/agents/[providerAgentId]/owners?email=foo@bar.com
 *
 * Operator-only. Revokes the named owner from this agent's tenant:
 *   1. Resolve tenant_id from provider_agent_id.
 *   2. Find any tenant_members row whose linked auth.users.email matches
 *      the query param (case-insensitive). Delete it if present.
 *   3. Mark all still-pending tenant_invitations rows for the same
 *      (tenant_id, email) as `consumed_at = now()` so the email cannot
 *      sign back in via a leftover invite or sign-in link.
 *
 * IMPORTANT — what we do NOT delete:
 *   - The auth.users row. The same user may own other tenants, and the
 *     login identity is global; nuking it would break re-onboarding and
 *     cross-tenant access elsewhere.
 *   - Conversations, bookings, consent logs, transcripts. Tenant data
 *     stays. Only access is revoked.
 *
 * After this call, the email no longer passes the tenant-member allow-list
 * for this tenant — but stays a valid login identity globally, so re-
 * inviting them in the future Just Works.
 *
 * Returns:
 *   - 200 { ok: true, revoked_member, revoked_invitations }
 *   - 400 missing_email
 *   - 401 unauthenticated
 *   - 403 not_an_operator
 *   - 404 agent_not_found
 *   - 500 on DB errors
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const gate = await getOperatorOrJsonError();
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }
  const { providerAgentId } = await params;

  const emailRaw = req.nextUrl.searchParams.get("email");
  if (!emailRaw) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const service = getServiceRoleSupabase();
  const { data: agentRow, error: lookupErr } = await service
    .from("agents")
    .select("tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: "lookup_failed", message: lookupErr.message },
      { status: 500 },
    );
  }
  if (!agentRow) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }
  const tenantId = agentRow.tenant_id as string;

  // Find the user_id (if any) tied to this email for this tenant. Reusing
  // the same RPC that the GET path calls — it does the auth.users join we
  // can't do directly from PostgREST.
  const { data: ownersRaw, error: ownersErr } = await service.rpc("get_tenant_owners", {
    p_tenant_id: tenantId,
  });
  if (ownersErr) {
    return NextResponse.json(
      { error: "owners_lookup_failed", message: ownersErr.message },
      { status: 500 },
    );
  }
  const owners = (ownersRaw ?? []) as Array<{
    user_id: string;
    email: string;
  }>;
  const match = owners.find((o) => o.email.toLowerCase() === email);

  let revokedMember = false;
  if (match) {
    const { error: delErr } = await service
      .from("tenant_members")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", match.user_id);
    if (delErr) {
      return NextResponse.json(
        { error: "member_delete_failed", message: delErr.message },
        { status: 500 },
      );
    }
    revokedMember = true;
  }

  // Consume any still-pending invitations so leftover sign-in links can't
  // be redeemed to re-grant access. We do NOT delete the invitation row —
  // it stays as an audit breadcrumb, just flipped to consumed.
  const { data: consumed, error: consumeErr } = await service
    .from("tenant_invitations")
    .update({ consumed_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("consumed_at", null)
    .select("id");
  if (consumeErr) {
    return NextResponse.json(
      { error: "invitation_consume_failed", message: consumeErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    revoked_member: revokedMember,
    revoked_invitations: consumed?.length ?? 0,
  });
}

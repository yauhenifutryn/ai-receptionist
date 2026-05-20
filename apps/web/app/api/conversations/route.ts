import { NextResponse, type NextRequest } from "next/server";
import { ListConversationsQuerySchema } from "@ai-receptionist/contracts";
import {
  handleListConversations,
  lazyFinalizeMissing,
  type ListAudience,
} from "@ai-receptionist/backend/conversations";
import { fetchElevenLabsConversation } from "@ai-receptionist/backend/integrations/elevenlabs";
import { createSupabasePostCallRepository } from "@ai-receptionist/backend/post-call/supabase-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations
 *
 * Three audience-routed code paths, picked from the request shape:
 *   1. PIN path     — `?pin=...&agentId=...`: no Supabase auth required.
 *                     Validate PIN against `agents.pin_code` with the service-role
 *                     client, then forward to the pure handler in prospect mode.
 *   2. Operator path — authenticated user whose email is in `operator_emails`.
 *                      Cross-tenant; uses the user-JWT Supabase so RLS still fires
 *                      (operator policies grant cross-tenant SELECT).
 *   3. Tenant member — authenticated user with at least one row in `tenant_members`.
 *                      Owner audience; tenant derived from first membership.
 */
export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = ListConversationsQuerySchema.safeParse(sp);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const q = parsed.data;

  // 1. PIN path: no Supabase session needed; service-role + manual PIN check.
  if (q.pin) {
    if (!q.agentId) {
      return NextResponse.json({ error: "agentId_required" }, { status: 400 });
    }
    const service = getServiceRoleSupabase();
    const { data: agentRow } = await service
      .from("agents")
      .select("pin_code")
      .eq("provider_agent_id", q.agentId)
      .maybeSingle();
    if (!agentRow || agentRow.pin_code !== q.pin) {
      return NextResponse.json({ error: "pin_mismatch" }, { status: 403 });
    }
    const r = await handleListConversations(q, {
      audience: "prospect",
      supabase: service,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ rows: r.rows });
  }

  // 2 + 3. Authenticated paths.
  const userSupabase = await getUserSupabase();
  const { data: userData } = await userSupabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: op } = await userSupabase
    .from("operator_emails")
    .select("email")
    .eq("email", userData.user.email)
    .maybeSingle();
  if (op) {
    return withLazyRetry(q, "operator", undefined, userSupabase);
  }

  // Tenant member path: derive tenant from the first membership row.
  // RLS on tenant_members already scopes this to the current user's rows.
  const { data: membership } = await userSupabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return withLazyRetry(q, "owner", membership.tenant_id, userSupabase);
}

/**
 * Run the list handler, then opportunistically hydrate any sessions that
 * streamed turns to test_transcripts but never reached /finalize. After
 * hydration, re-run the list so the response includes the freshly-written
 * rows. Skipped for the PIN/prospect path — prospects shouldn't trigger
 * EL fetches at scale.
 */
async function withLazyRetry(
  q: ReturnType<typeof ListConversationsQuerySchema.parse>,
  audience: Exclude<ListAudience, "prospect">,
  tenantId: string | undefined,
  userSupabase: SupabaseClient,
): Promise<NextResponse> {
  const deps = { audience, tenantId, supabase: userSupabase } as const;
  const first = await handleListConversations(q, deps);
  if (!first.ok) return NextResponse.json({ error: first.error }, { status: first.status });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  // Lazy retry only fires when we have an agentId scope (otherwise the
  // diff over test_transcripts is unbounded across all agents) AND an EL
  // API key (otherwise the finalize call would only write stub rows).
  if (q.agentId && apiKey) {
    const known = new Set(
      (first.rows as Array<{ conversation_id: string }>).map((r) => r.conversation_id),
    );
    const service = getServiceRoleSupabase();
    const hydrated = await lazyFinalizeMissing({
      providerAgentId: q.agentId,
      knownConversationIds: known,
      service,
      apiKey,
      fetchEl: ({ conversationId }) => fetchElevenLabsConversation({ conversationId, apiKey }),
      repo: createSupabasePostCallRepository(service),
    });
    if (hydrated > 0) {
      const refreshed = await handleListConversations(q, deps);
      if (refreshed.ok) return NextResponse.json({ rows: refreshed.rows, hydrated });
    }
  }
  return NextResponse.json({ rows: first.rows });
}

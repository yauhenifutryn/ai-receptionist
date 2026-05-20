import type { ListConversationsQuery } from "@ai-receptionist/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ListAudience = "operator" | "owner" | "prospect";

export interface ListDeps {
  audience: ListAudience;
  tenantId?: string;
  supabase: SupabaseClient;
}

export type ListResult =
  | { ok: true; rows: unknown[] }
  | { ok: false; status: number; error: string };

const CONVERSATION_COLUMNS =
  "id, conversation_id, tenant_id, agent_id, provider_agent_id, source, direction, " +
  "started_at, ended_at, duration_seconds, end_reason, consent_flag, consent_decision, " +
  "caller_language, appointment_category, escalated, escalation_reason, booked_booking_id, " +
  "tool_call_count, tool_error_count, finalized_at, created_at, updated_at";

/**
 * Pure handler for the conversations list endpoint.
 *
 * Audience routing (the only difference between code paths):
 *  - operator: cross-tenant access. agentId optional. All sources visible.
 *  - owner   : tenant-scoped. Default hides `browser_test` (operator QA noise).
 *              `includeBrowserTest=true` lifts that filter.
 *  - prospect: PIN-gated single-agent view. Always forces source=pin_demo.
 *
 * The caller is responsible for choosing the audience and providing the right
 * Supabase client (service-role for the prospect/PIN path, user-JWT for the
 * authenticated paths so RLS fires).
 */
export async function handleListConversations(
  q: ListConversationsQuery,
  deps: ListDeps,
): Promise<ListResult> {
  let chain = deps.supabase.from("conversations").select(CONVERSATION_COLUMNS);

  if (deps.audience === "prospect") {
    if (!q.agentId) return { ok: false, status: 400, error: "agentId_required" };
    chain = chain.eq("provider_agent_id", q.agentId).eq("source", "pin_demo");
  } else {
    if (q.agentId) chain = chain.eq("provider_agent_id", q.agentId);
    if (deps.audience === "owner") {
      if (!deps.tenantId) return { ok: false, status: 400, error: "tenant_required" };
      chain = chain.eq("tenant_id", deps.tenantId);
      if (!q.includeBrowserTest) chain = chain.in("source", ["pstn", "pin_demo"]);
    }
    if (q.source) chain = chain.eq("source", q.source);
  }

  if (q.dateFrom) chain = chain.gte("started_at", q.dateFrom);
  if (q.dateTo) chain = chain.lte("started_at", q.dateTo);
  if (q.language) chain = chain.eq("caller_language", q.language);
  if (q.bookedOnly) chain = chain.not("booked_booking_id", "is", null);

  const { data, error } = await chain
    .order("started_at", { ascending: false })
    .limit(q.limit ?? 50);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, rows: data ?? [] };
}

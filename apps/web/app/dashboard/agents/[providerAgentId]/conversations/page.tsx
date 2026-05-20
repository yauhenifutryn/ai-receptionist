import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/supabase-server";
import ConversationsFilters from "./conversations-filters";
import ConversationsTable, { type ConversationRow } from "./conversations-table";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ providerAgentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Operator-only conversations list for a specific agent.
 *
 * Reads the canonical `conversations` table directly via the user-scoped
 * Supabase client (RLS allows operator SELECT). We deliberately bypass the
 * /api/conversations route here — server components already carry the user
 * JWT via cookies, so a server-side select short-circuits an unnecessary
 * round-trip. The API is reserved for client-side panes (prospect demo
 * past-sessions, owner dashboard).
 */
export default async function Page({ params, searchParams }: PageProps) {
  const { providerAgentId } = await params;
  const sp = await searchParams;

  const { supabase } = await requireOperator({
    redirectPath: `/dashboard/agents/${providerAgentId}/conversations`,
  });

  // Resolve the clinic display name for the header.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, provider_agent_id, tenant:tenants(display_name, name)")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (!agent) redirect("/dashboard");

  const tenant = Array.isArray(agent.tenant) ? agent.tenant[0] : agent.tenant;
  const clinic = tenant?.display_name ?? tenant?.name ?? "Unknown";

  // Build the conversations query with the same filter set the
  // /api/conversations list-handler applies for operator audience.
  const sourceParam = typeof sp.source === "string" ? sp.source : "";
  const languageParam = typeof sp.language === "string" ? sp.language : "";
  const dateFromParam = typeof sp.dateFrom === "string" ? sp.dateFrom : "";
  const dateToParam = typeof sp.dateTo === "string" ? sp.dateTo : "";
  const bookedOnlyParam = sp.bookedOnly === "1" || sp.bookedOnly === "true";

  let query = supabase
    .from("conversations")
    .select(
      "conversation_id, source, started_at, duration_seconds, caller_language, consent_flag, tool_call_count, booked_booking_id",
    )
    .eq("provider_agent_id", providerAgentId);

  if (sourceParam === "pstn" || sourceParam === "browser_test" || sourceParam === "pin_demo") {
    query = query.eq("source", sourceParam);
  }
  if (languageParam === "pl" || languageParam === "en" || languageParam === "ru") {
    query = query.eq("caller_language", languageParam);
  }
  if (dateFromParam) query = query.gte("started_at", dateFromParam);
  if (dateToParam) query = query.lte("started_at", dateToParam);
  if (bookedOnlyParam) query = query.not("booked_booking_id", "is", null);

  const { data: rowsData, error } = await query
    .order("started_at", { ascending: false })
    .limit(100);

  const rows = (rowsData ?? []) as unknown as ConversationRow[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/test/${providerAgentId}` as Route}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← {clinic}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Conversations</h1>
          <p className="font-mono text-xs text-neutral-400">{providerAgentId}</p>
        </div>
        <Link
          href={`/dashboard/agents/${providerAgentId}/analytics` as Route}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          View analytics →
        </Link>
      </header>

      <ConversationsFilters />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load conversations: {error.message}
        </div>
      ) : (
        <ConversationsTable rows={rows} providerAgentId={providerAgentId} />
      )}
    </main>
  );
}

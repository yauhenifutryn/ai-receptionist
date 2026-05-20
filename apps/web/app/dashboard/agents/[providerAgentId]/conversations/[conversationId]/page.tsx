import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/supabase-server";
import ConversationDetail from "./conversation-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ providerAgentId: string; conversationId: string }>;
}

/**
 * Operator-only conversation drill-down. Mirrors the list page's strategy:
 * direct user-supabase select (RLS-gated) rather than fetching the internal
 * /api/conversations/[id] route. The detail row is read once and passed to
 * a client component that handles both PSTN and EL JSON shapes.
 */
export default async function Page({ params }: PageProps) {
  const { providerAgentId, conversationId } = await params;

  const { supabase } = await requireOperator({
    redirectPath: `/dashboard/agents/${providerAgentId}/conversations/${conversationId}`,
  });

  const { data: row } = await supabase
    .from("conversations")
    .select(
      "conversation_id, source, direction, started_at, ended_at, duration_seconds, end_reason, consent_flag, consent_decision, caller_language, appointment_category, escalated, escalation_reason, booked_booking_id, tool_call_count, tool_error_count, raw_jsonb, finalized_at",
    )
    .eq("conversation_id", conversationId)
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();

  if (!row) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link
        href={`/dashboard/agents/${providerAgentId}/conversations` as Route}
        className="text-sm text-neutral-500 hover:text-neutral-800"
      >
        ← Conversations
      </Link>
      <ConversationDetail row={row as never} />
    </main>
  );
}

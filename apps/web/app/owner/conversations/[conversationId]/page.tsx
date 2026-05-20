import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import ConversationDetail from "@/app/dashboard/agents/[providerAgentId]/conversations/[conversationId]/conversation-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * Owner drill-down. Reuses the operator ConversationDetail client component,
 * which is "use client" and reads only from the `row` prop — safe to mount
 * here. Auth is gated by the /owner layout (tenant_members required) and
 * the row select is RLS-scoped, so a stray conversation_id from another
 * tenant cleanly returns null → 404.
 */
export default async function Page({ params }: PageProps) {
  const { conversationId } = await params;

  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  const { data: row } = await supabase
    .from("conversations")
    .select(
      "conversation_id, source, direction, started_at, ended_at, duration_seconds, end_reason, consent_flag, consent_decision, caller_language, appointment_category, escalated, escalation_reason, booked_booking_id, tool_call_count, tool_error_count, raw_jsonb, finalized_at",
    )
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!row) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link
        href={"/owner/conversations" as Route}
        className="text-sm text-neutral-500 hover:text-neutral-800"
      >
        ← Conversations
      </Link>
      <ConversationDetail row={row as never} />
    </main>
  );
}

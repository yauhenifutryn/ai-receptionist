import Link from "next/link";
import type { Route } from "next";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

/**
 * 7-day operator stats card for the test page. Server component reading
 * via service-role (cross-tenant operator surface). Renders four counters
 * and a link to the full conversations list.
 */
export default async function ConversationStatsStrip({ agentId }: { agentId: string }) {
  const supabase = getServiceRoleSupabase();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("conversations")
    .select("duration_seconds, booked_booking_id")
    .eq("provider_agent_id", agentId)
    .gte("started_at", since);

  const rows = (data ?? []) as Array<{
    duration_seconds: number | null;
    booked_booking_id: string | null;
  }>;
  const total = rows.length;
  const avgDur = total
    ? Math.round(rows.reduce((a, r) => a + (r.duration_seconds ?? 0), 0) / total)
    : 0;
  const booked = rows.filter((r) => r.booked_booking_id).length;
  const conv = total ? Math.round((booked / total) * 100) : 0;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Stat label="7-day calls" value={String(total)} />
      <Stat label="Avg dur" value={`${Math.floor(avgDur / 60)}m${avgDur % 60}s`} />
      <Stat label="Booked" value={String(booked)} />
      <Stat label="Conv %" value={`${conv}%`} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/agents/${agentId}/conversations` as Route}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          View conversations →
        </Link>
        <Link
          href={`/dashboard/agents/${agentId}/analytics` as Route}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Open analytics →
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col px-4">
      <span className="text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      <span className="text-lg font-semibold text-neutral-900">{value}</span>
    </div>
  );
}

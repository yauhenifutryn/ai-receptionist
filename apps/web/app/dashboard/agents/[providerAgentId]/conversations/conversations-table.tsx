"use client";

import Link from "next/link";
import type { Route } from "next";
import { extractRagStats } from "@/lib/rag-stats";

export interface ConversationRow {
  conversation_id: string;
  source: "pstn" | "browser_test" | "pin_demo";
  started_at: string;
  duration_seconds: number | null;
  caller_language: string | null;
  consent_flag: boolean | null;
  tool_call_count: number;
  booked_booking_id: string | null;
  /** Optional EL payload — when present, used to compute RAG hit counts in
   *  the KB column. Server may omit it for lightweight list pages. */
  raw_jsonb?: unknown;
}

const sourceLabel: Record<ConversationRow["source"], string> = {
  pstn: "PSTN",
  browser_test: "Browser",
  pin_demo: "PIN",
};
const sourceColor: Record<ConversationRow["source"], string> = {
  pstn: "bg-emerald-100 text-emerald-800",
  browser_test: "bg-neutral-100 text-neutral-700",
  pin_demo: "bg-amber-100 text-amber-800",
};

function formatDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, "0")}`;
}

export default function ConversationsTable({
  rows,
  providerAgentId,
}: {
  rows: ConversationRow[];
  providerAgentId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
        No conversations yet for this agent.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Dur.</th>
            <th className="px-4 py-3">Lang</th>
            <th className="px-4 py-3">Consent</th>
            <th className="px-4 py-3">Tools</th>
            <th
              className="px-4 py-3"
              title="Agent turns that pulled from the knowledge base on this call"
            >
              KB
            </th>
            <th className="px-4 py-3">Booked</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => {
            const ragStats = r.raw_jsonb ? extractRagStats(r.raw_jsonb) : null;
            const kbHits = ragStats?.turnsWithRetrieval ?? null;
            return (
              <tr key={r.conversation_id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-xs">
                  {new Date(r.started_at).toLocaleString("pl-PL")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sourceColor[r.source]}`}
                  >
                    {sourceLabel[r.source]}
                  </span>
                </td>
                <td className="px-4 py-3">{formatDuration(r.duration_seconds)}</td>
                <td className="px-4 py-3">{r.caller_language ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.consent_flag === null ? "—" : r.consent_flag ? "✓" : "✗"}
                </td>
                <td className="px-4 py-3">{r.tool_call_count}</td>
                <td className="px-4 py-3 tabular-nums">
                  {kbHits === null ? (
                    <span className="text-neutral-300">—</span>
                  ) : kbHits === 0 ? (
                    <span className="text-neutral-400">0</span>
                  ) : (
                    <span
                      className="font-medium text-neutral-900"
                      title={`${kbHits} agent turn(s) referenced the KB`}
                    >
                      {kbHits}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{r.booked_booking_id ? "✓" : ""}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={
                      `/dashboard/agents/${providerAgentId}/conversations/${r.conversation_id}` as Route
                    }
                    className="text-emerald-700 hover:text-emerald-900"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

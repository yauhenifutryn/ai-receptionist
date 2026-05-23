"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { formatShortDateTime } from "@/lib/format-pl-datetime";

/**
 * Owner-facing row shape. Narrower than the operator table — owners only
 * see what's relevant for "did the bot do the job": when, how it came in,
 * how long, in what language, and whether it ended in a booking.
 */
export interface OwnerConversationRow {
  conversation_id: string;
  source: "pstn" | "browser_test" | "pin_demo";
  started_at: string;
  duration_seconds: number | null;
  caller_language: string | null;
  booked_booking_id: string | null;
}

function formatDuration(s: number | null): string {
  if (s == null) return "—";
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}m${String(seconds).padStart(2, "0")}`;
}

function formatSource(source: OwnerConversationRow["source"]): string {
  if (source === "pstn") return "Telefon";
  if (source === "pin_demo") return "Demo";
  return "QA";
}

export default function OwnerConversationsTable({
  rows,
  includeBrowserTest,
}: {
  rows: OwnerConversationRow[];
  includeBrowserTest: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function toggleIncludeBrowserTest() {
    const next = new URLSearchParams(sp.toString());
    if (includeBrowserTest) {
      next.delete("includeBrowserTest");
    } else {
      next.set("includeBrowserTest", "1");
    }
    const query = next.toString();
    router.replace(query ? `?${query}` : "?");
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={includeBrowserTest}
          onChange={toggleIncludeBrowserTest}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Include internal QA sessions
      </label>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
          No conversations yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Booked</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.conversation_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {formatShortDateTime(r.started_at)}
                  </td>
                  <td className="px-4 py-3">{formatSource(r.source)}</td>
                  <td className="px-4 py-3">{formatDuration(r.duration_seconds)}</td>
                  <td className="px-4 py-3">{r.caller_language ?? "—"}</td>
                  <td className="px-4 py-3">{r.booked_booking_id ? "✓" : ""}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/owner/conversations/${r.conversation_id}` as Route}
                      className="text-emerald-700 hover:text-emerald-900"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

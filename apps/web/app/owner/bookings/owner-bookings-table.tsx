"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { formatPolishDayAndTime } from "@/lib/format-pl-datetime";

/**
 * Owner-facing booking row. Trimmed from the canonical bookings shape —
 * we hide the patient phone (PII) and the agent's internal request_id.
 *
 * `recovered_revenue_pln` is computed by the post-call backend pipeline
 * via service_value_matrix → stored on the row directly. We just read.
 */
export interface OwnerBookingRow {
  id: string;
  starts_at: string;
  patient_name: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
  appointment_category: string;
  recovered_revenue_pln: number | null;
  short_token: string | null;
  conversation_id: string;
}

function formatStatus(s: OwnerBookingRow["status"]): string {
  if (s === "booked") return "Zarezerwowane";
  if (s === "cancelled") return "Anulowane";
  if (s === "completed") return "Zakończone";
  if (s === "no_show") return "Brak pacjenta";
  return s;
}

function statusBadgeClass(s: OwnerBookingRow["status"]): string {
  if (s === "cancelled") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "no_show") return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "completed") return "bg-neutral-100 text-neutral-700 border-neutral-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export default function OwnerBookingsTable({
  rows,
  dateFrom,
  dateTo,
}: {
  rows: OwnerBookingRow[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setRange(key: "dateFrom" | "dateTo", value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `?${query}` : "?");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-700">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">From</span>
          <input
            type="date"
            value={dateFrom ?? ""}
            onChange={(e) => setRange("dateFrom", e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">To</span>
          <input
            type="date"
            value={dateTo ?? ""}
            onChange={(e) => setRange("dateTo", e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs"
          />
        </label>
        {dateFrom || dateTo ? (
          <button
            type="button"
            onClick={() => router.replace("?")}
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            Clear
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
          No bookings yet. Real phone bookings will start arriving once the operator finishes phone
          number verification with Zadarma. In the meantime, ask the operator for your demo URL
          (<code className="rounded bg-white/60 px-1">/demo/&lt;agentId&gt;?pin=…</code>) to create a
          test booking end-to-end.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Recovered</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-xs text-neutral-700">
                    {formatPolishDayAndTime(new Date(r.starts_at))}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">{r.patient_name}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{r.appointment_category}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(r.status)}`}
                    >
                      {formatStatus(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-emerald-700">
                    {r.recovered_revenue_pln != null
                      ? `${Number(r.recovered_revenue_pln).toLocaleString("pl-PL")} PLN`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.short_token ? (
                      <Link
                        href={`/b/${r.short_token}` as Route}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        Confirmation →
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
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

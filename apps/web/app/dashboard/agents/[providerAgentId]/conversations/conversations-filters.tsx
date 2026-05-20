"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Operator-side filter bar for the conversations list. Reads + writes the
 * URL query string so refreshing or sharing the URL preserves the view.
 * Server component up the tree re-runs whenever search params change.
 */
export default function ConversationsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(k: string, v: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (v && v.length) next.set(k, v);
    else next.delete(k);
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <select
        className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        defaultValue={sp.get("source") ?? ""}
        onChange={(e) => set("source", e.target.value || null)}
      >
        <option value="">All sources</option>
        <option value="pstn">PSTN</option>
        <option value="browser_test">Browser test</option>
        <option value="pin_demo">PIN demo</option>
      </select>
      <select
        className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        defaultValue={sp.get("language") ?? ""}
        onChange={(e) => set("language", e.target.value || null)}
      >
        <option value="">All languages</option>
        <option value="pl">Polish</option>
        <option value="en">English</option>
        <option value="ru">Russian</option>
      </select>
      <input
        type="date"
        className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        defaultValue={sp.get("dateFrom")?.slice(0, 10) ?? ""}
        onChange={(e) =>
          set("dateFrom", e.target.value ? `${e.target.value}T00:00:00.000Z` : null)
        }
        aria-label="From date"
      />
      <input
        type="date"
        className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        defaultValue={sp.get("dateTo")?.slice(0, 10) ?? ""}
        onChange={(e) =>
          set("dateTo", e.target.value ? `${e.target.value}T23:59:59.999Z` : null)
        }
        aria-label="To date"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          defaultChecked={sp.get("bookedOnly") === "1"}
          onChange={(e) => set("bookedOnly", e.target.checked ? "1" : null)}
        />
        Booked only
      </label>
      {pending ? <span className="text-xs text-neutral-400">…</span> : null}
    </div>
  );
}

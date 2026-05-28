"use client";

import { useState } from "react";

type OutreachStatus = "created" | "audited" | "contacted" | "positive" | "negative";

const LABELS: Record<OutreachStatus, string> = {
  created: "Created",
  audited: "Audited",
  contacted: "Contacted",
  positive: "Positive",
  negative: "Negative",
};

const PALETTE: Record<OutreachStatus, string> = {
  created: "bg-neutral-100 text-neutral-700",
  audited: "bg-sky-100 text-sky-800",
  contacted: "bg-amber-100 text-amber-800",
  positive: "bg-emerald-100 text-emerald-800",
  negative: "bg-rose-100 text-rose-800",
};

interface Props {
  providerAgentId: string;
  initial: OutreachStatus;
}

/**
 * Inline outreach-status switcher used per-row on the operator dashboard.
 * Edits without page reload via PATCH /api/agents/<id>/outreach-status.
 * Persists optimistically — if the API rejects, we revert and surface the
 * error inline.
 */
export default function OutreachStatusSelect({ providerAgentId, initial }: Props) {
  const [status, setStatus] = useState<OutreachStatus>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: OutreachStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${providerAgentId}/outreach-status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setStatus(prev);
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setError(j.message ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setStatus(prev);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="relative inline-flex items-center">
        <select
          value={status}
          onChange={(e) => onChange(e.target.value as OutreachStatus)}
          disabled={saving}
          className={`appearance-none [-webkit-appearance:none] rounded-full pl-2.5 pr-8 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition disabled:opacity-50 cursor-pointer ${PALETTE[status]}`}
        >
          {(Object.keys(LABELS) as OutreachStatus[]).map((s) => (
            <option key={s} value={s}>
              {LABELS[s]}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 text-[8px] leading-none text-current opacity-70"
        >
          ▼
        </span>
      </label>
      {error ? <p className="text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { DemoStrings } from "@/lib/demo-i18n";

/**
 * Prospect-facing past-sessions pane on /demo/<agentId>. Lists the prospect's
 * own PIN-scoped conversations (newest-first, capped at 20) by calling the
 * PIN-authenticated `/api/conversations` endpoint. Clicking a row lazily
 * fetches the detail and expands the transcript inline.
 *
 * Resilience notes:
 *  - `raw_jsonb.transcript` is the EL native shape: turns carry `message`
 *    and `time_in_call_secs`, not `text`/`startMs`. We render
 *    `turn.message ?? turn.text` so both shapes survive.
 *  - If `pin` is null/empty the pane renders nothing (the demo page already
 *    rejects PIN-less access via notFound, but be defensive).
 */
interface Row {
  conversation_id: string;
  started_at: string;
  duration_seconds: number | null;
  caller_language: string | null;
  booked_booking_id: string | null;
}

interface Turn {
  role?: string;
  message?: string;
  text?: string;
  time_in_call_secs?: number;
}

interface Props {
  agentId: string;
  pin: string | null;
  strings: DemoStrings;
}

export default function PastSessionsPane({ agentId, pin, strings }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, Turn[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pin) {
      setRows([]);
      return;
    }
    const u = new URLSearchParams({ agentId, pin, limit: "20" });
    let cancelled = false;
    fetch(`/api/conversations?${u.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.resolve({ rows: [] })))
      .then((d: { rows?: Row[] }) => {
        if (!cancelled) setRows(d.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, pin]);

  async function toggle(cid: string) {
    if (expanded === cid) {
      setExpanded(null);
      return;
    }
    if (transcripts[cid]) {
      setExpanded(cid);
      return;
    }
    if (!pin) return;
    setLoadingId(cid);
    try {
      const u = new URLSearchParams({ agentId, pin });
      const r = await fetch(
        `/api/conversations/${encodeURIComponent(cid)}?${u.toString()}`,
      );
      const d = r.ok ? await r.json() : { row: null };
      const raw = (d?.row?.raw_jsonb ?? {}) as { transcript?: unknown };
      const turns: Turn[] = Array.isArray(raw.transcript)
        ? (raw.transcript as Turn[])
        : [];
      setTranscripts((s) => ({ ...s, [cid]: turns }));
      setExpanded(cid);
    } catch {
      setTranscripts((s) => ({ ...s, [cid]: [] }));
      setExpanded(cid);
    } finally {
      setLoadingId(null);
    }
  }

  if (!pin) return null;
  if (!rows) return null;

  return (
    <section className="mt-12 flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
        {strings.pastSessionsTitle}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400 shadow-sm">
          {strings.pastSessionsEmpty}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {rows.map((r) => {
            const isOpen = expanded === r.conversation_id;
            const turns = transcripts[r.conversation_id] ?? [];
            return (
              <li key={r.conversation_id} className="flex flex-col">
                <button
                  onClick={() => toggle(r.conversation_id)}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-neutral-50"
                >
                  <span className="font-mono text-xs text-neutral-500">
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-4 text-xs text-neutral-700">
                    {r.duration_seconds != null && (
                      <span>
                        <span className="text-neutral-400">
                          {strings.pastSessionsDuration}:
                        </span>{" "}
                        {Math.max(1, Math.round(r.duration_seconds))}s
                      </span>
                    )}
                    {r.caller_language && (
                      <span>
                        <span className="text-neutral-400">
                          {strings.pastSessionsLanguage}:
                        </span>{" "}
                        {r.caller_language}
                      </span>
                    )}
                    {r.booked_booking_id && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                        {strings.pastSessionsBooked}
                      </span>
                    )}
                    <span className="text-neutral-400" aria-hidden>
                      {isOpen ? "▴" : "▾"}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 text-sm">
                    {loadingId === r.conversation_id ? (
                      <p className="text-neutral-400">…</p>
                    ) : turns.length === 0 ? (
                      <p className="text-neutral-400">—</p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {turns.map((t, i) => {
                          const text = t.message ?? t.text ?? "";
                          if (!text) return null;
                          return (
                            <li
                              key={i}
                              className={
                                t.role === "user"
                                  ? "text-neutral-800"
                                  : "text-emerald-900"
                              }
                            >
                              <strong className="mr-2 text-xs uppercase tracking-wider text-neutral-500">
                                {t.role ?? "?"}:
                              </strong>
                              {text}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

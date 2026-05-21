"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { extractRagStats } from "@/lib/rag-stats";

/**
 * Two shapes coexist in raw_jsonb depending on the call surface:
 *   - PSTN (from apps/backend/src/post-call PostCallWebhookSchema): turns use
 *     { role, text, startMs } and tools live under raw_jsonb.toolInvocations
 *     with camelCase keys (toolName, argsJson, latencyMs, succeeded).
 *   - Web/PIN (from GET /v1/convai/conversations/{id}, persisted by
 *     /api/conversations/finalize): turns use { role, message, time_in_call_secs }
 *     and tools live nested per-turn in tool_calls — finalize-handler flattens
 *     them to raw_jsonb.toolInvocations using EL snake_case keys
 *     (tool_name, params_as_json, result_value, is_error).
 * This component normalizes both into one render.
 */
interface Turn {
  role?: string;
  text?: string;
  message?: string;
  start_ms?: number;
  startMs?: number;
  time_in_call_secs?: number;
}
interface ToolCall {
  toolName?: string;
  tool_name?: string;
  argsJson?: string;
  args_json?: string;
  params_as_json?: string;
  responseJson?: string;
  response_json?: string;
  result_value?: string;
  latencyMs?: number;
  latency_ms?: number;
  succeeded?: boolean;
  is_error?: boolean;
}
interface RawJsonb {
  transcript?: Turn[];
  toolInvocations?: ToolCall[];
  tool_calls?: ToolCall[];
}
interface ConversationRow {
  conversation_id: string;
  source: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
  caller_language: string | null;
  consent_flag: boolean | null;
  direction: string | null;
  appointment_category: string | null;
  escalated: boolean;
  escalation_reason: string | null;
  booked_booking_id: string | null;
  tool_call_count: number;
  tool_error_count: number;
  finalized_at: string | null;
  raw_jsonb: RawJsonb | null;
}

function fmtTs(turn: Turn): string {
  const secs =
    typeof turn.time_in_call_secs === "number"
      ? turn.time_in_call_secs
      : typeof turn.startMs === "number"
        ? turn.startMs / 1000
        : typeof turn.start_ms === "number"
          ? turn.start_ms / 1000
          : null;
  if (secs == null) return "";
  const s = Math.floor(secs);
  return `[${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}]`;
}

function turnText(turn: Turn): string {
  return turn.text ?? turn.message ?? "";
}

export default function ConversationDetail({ row }: { row: ConversationRow }) {
  const [showRaw, setShowRaw] = useState(false);
  const raw = (row.raw_jsonb ?? {}) as RawJsonb;
  const transcript: Turn[] = Array.isArray(raw.transcript) ? raw.transcript : [];
  const tools: ToolCall[] = Array.isArray(raw.toolInvocations)
    ? raw.toolInvocations
    : Array.isArray(raw.tool_calls)
      ? raw.tool_calls
      : [];
  const ragStats = extractRagStats(row.raw_jsonb);
  const perDocList = Object.entries(ragStats.perDocCounts)
    .map(([docId, count]) => ({ docId, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        Conversation · {row.source} · {new Date(row.started_at).toLocaleString("pl-PL")}
      </h1>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Metadata
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="Duration">
            {row.duration_seconds != null ? `${row.duration_seconds}s` : "—"}
          </Field>
          <Field label="End reason">{row.end_reason ?? "—"}</Field>
          <Field label="Language">{row.caller_language ?? "—"}</Field>
          <Field label="Consent">
            {row.consent_flag === null ? "—" : row.consent_flag ? "✓" : "✗"}
          </Field>
          <Field label="Direction">{row.direction ?? "—"}</Field>
          <Field label="Booked">
            {row.booked_booking_id ? (
              <Link
                href={`/b/${row.booked_booking_id}` as Route}
                className="text-emerald-700 hover:text-emerald-900"
              >
                ✓ {row.booked_booking_id.slice(0, 8)}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Escalated">{row.escalated ? "yes" : "no"}</Field>
          <Field label="Finalized">{row.finalized_at ? "yes" : "pending"}</Field>
          <Field label="Tool calls">
            {row.tool_call_count}
            {row.tool_error_count > 0 ? ` (${row.tool_error_count} err)` : ""}
          </Field>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Transcript
        </h2>
        {transcript.length === 0 ? (
          <p className="text-sm text-neutral-400">No transcript stored.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {transcript.map((t, i) => (
              <li
                key={i}
                className={t.role === "user" ? "text-neutral-800" : "text-emerald-900"}
              >
                <span className="mr-2 font-mono text-xs text-neutral-400">{fmtTs(t)}</span>
                <strong className="mr-2">{t.role}:</strong>
                {turnText(t)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Knowledge retrieval
          </h2>
          <p className="font-mono text-xs text-neutral-400">
            {ragStats.turnsWithRetrieval} / {ragStats.totalAgentTurns} agent
            turns used RAG
          </p>
        </div>
        {ragStats.turnsWithRetrieval === 0 ? (
          <p className="text-sm text-neutral-400">
            No knowledge base documents were referenced during this call.
            Either the agent answered from the system prompt alone (small talk,
            consent, language switching) or EL did not populate retrieval
            attribution for these turns.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {perDocList.map(({ docId, count }) => (
                <span
                  key={docId}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-mono text-xs text-neutral-800"
                  title={docId}
                >
                  <span>{docId.slice(0, 14)}…</span>
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white tabular-nums">
                    {count}
                  </span>
                </span>
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {ragStats.turnRefs.map((ref) => (
                <li
                  key={ref.turnIndex}
                  className="rounded-lg border border-neutral-100 bg-neutral-50 p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-neutral-400">
                      turn {ref.turnIndex}
                      {ref.timeSec != null
                        ? ` · ${Math.floor(ref.timeSec)}s`
                        : ""}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-500">
                      {ref.docIds.length} doc(s)
                      {ref.chunkCount != null
                        ? ` · ${ref.chunkCount} chunks`
                        : ""}
                    </span>
                  </div>
                  {ref.preview ? (
                    <p className="mt-1 text-neutral-800">{ref.preview}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ref.docIds.map((id) => (
                      <code
                        key={id}
                        className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-neutral-700"
                        title={id}
                      >
                        {id.slice(0, 12)}…
                      </code>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Tool calls
        </h2>
        {tools.length === 0 ? (
          <p className="text-sm text-neutral-400">No tool calls.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {tools.map((t, i) => {
              const name = t.toolName ?? t.tool_name ?? "(unnamed)";
              const lat = t.latencyMs ?? t.latency_ms;
              const ok =
                typeof t.succeeded === "boolean"
                  ? t.succeeded
                  : t.is_error === true
                    ? false
                    : undefined;
              const args = t.argsJson ?? t.args_json ?? t.params_as_json;
              const resp = t.responseJson ?? t.response_json ?? t.result_value;
              return (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-100 bg-neutral-50 p-3"
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>{name}</span>
                    <span className="text-xs text-neutral-500">
                      {lat ? `${lat}ms · ` : ""}
                      {ok === false ? "✗ failed" : "✓"}
                    </span>
                  </div>
                  {args ? (
                    <pre className="mt-2 overflow-x-auto text-xs text-neutral-600">
                      args: {args}
                    </pre>
                  ) : null}
                  {resp ? (
                    <pre className="mt-1 overflow-x-auto text-xs text-neutral-600">
                      returns: {resp}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => setShowRaw((s) => !s)}
        className="self-start text-xs text-neutral-500 hover:text-neutral-800"
      >
        {showRaw ? "▴ Hide" : "▾ Show"} raw EL payload
      </button>
      {showRaw ? (
        <pre className="overflow-x-auto rounded-2xl border border-neutral-200 bg-neutral-900 p-4 text-xs text-emerald-200">
          {JSON.stringify(row.raw_jsonb, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{children}</dd>
    </>
  );
}

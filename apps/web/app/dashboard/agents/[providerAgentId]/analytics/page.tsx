import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/supabase-server";
import { aggregateRagStats } from "@/lib/rag-stats";
import { formatShortDateTime } from "@/lib/format-pl-datetime";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ providerAgentId: string }>;
}

// Hard cap on rows scanned to keep the server-component query bounded
// in memory. If the agent ever exceeds this we render a notice.
const ROW_LIMIT = 5000;

/**
 * Operator-only analytics for a single agent.
 *
 * Single SELECT pulls the columns needed for all five sections (capped at
 * ROW_LIMIT rows), then aggregates in TypeScript. For sprint-scale data the
 * cost of an in-process roll-up is negligible vs. five round-trips, and we
 * avoid materializing rollup tables we'd just have to throw away.
 *
 * RLS does the operator/tenant gate; requireOperator above is the surface-level
 * guard.
 */
interface AnalyticsRow {
  conversation_id: string;
  started_at: string;
  duration_seconds: number | null;
  source: "pstn" | "browser_test" | "pin_demo";
  caller_language: string | null;
  tool_call_count: number;
  booked_booking_id: string | null;
  caller_phone_e164: string | null;
  raw_jsonb: unknown;
}

/** EL exposes tool latency under two field names depending on the write path. */
interface ToolInvocationLike {
  toolName?: string;
  tool_name?: string;
  latencyMs?: number;
  latency_ms?: number;
  succeeded?: boolean;
  is_error?: boolean;
}

function readToolInvocations(raw: unknown): ToolInvocationLike[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { toolInvocations?: unknown };
  if (!Array.isArray(r.toolInvocations)) return [];
  return r.toolInvocations.filter(
    (t): t is ToolInvocationLike => t !== null && typeof t === "object",
  );
}

function toolName(t: ToolInvocationLike): string {
  return t.toolName ?? t.tool_name ?? "(unknown)";
}

function toolLatency(t: ToolInvocationLike): number | null {
  if (typeof t.latencyMs === "number") return t.latencyMs;
  if (typeof t.latency_ms === "number") return t.latency_ms;
  return null;
}

function toolErrored(t: ToolInvocationLike): boolean {
  // PSTN webhook: `succeeded: false`. EL fetch (browser/PIN): `is_error: true`
  // already flattened by finalize-handler into the same array shape.
  if (t.succeeded === false) return true;
  if (t.is_error === true) return true;
  return false;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? null;
}

function formatDurationMs(s: number): string {
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function maskPhone(e164: string): string {
  if (e164.length <= 4) return e164;
  return `${"*".repeat(e164.length - 4)}${e164.slice(-4)}`;
}

function hourInWarsaw(iso: string): number {
  // pl-PL `hour: numeric` returns 0..23 as a localized string. Parse it back.
  const h = new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "numeric",
    hour12: false,
  });
  const parsed = parseInt(h, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { providerAgentId } = await params;
  const { supabase } = await requireOperator({
    redirectPath: `/dashboard/agents/${providerAgentId}/analytics`,
  });

  // Resolve agent / clinic for the breadcrumb.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, provider_agent_id, tenant:tenants(display_name, name)")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (!agent) redirect("/dashboard");
  const tenant = Array.isArray(agent.tenant) ? agent.tenant[0] : agent.tenant;
  const clinic = tenant?.display_name ?? tenant?.name ?? "Unknown";

  // One SELECT, capped. Don't filter by date here — we need all-time tiles too.
  // For an agent doing 200 calls/month the limit is years of headroom.
  const { data: rowsData, error } = await supabase
    .from("conversations")
    .select(
      "conversation_id, started_at, duration_seconds, source, caller_language, tool_call_count, booked_booking_id, caller_phone_e164, raw_jsonb",
    )
    .eq("provider_agent_id", providerAgentId)
    .order("started_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Analytics</h1>
        </header>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load analytics: {error.message}
        </div>
      </main>
    );
  }

  const rows = (rowsData ?? []) as AnalyticsRow[];
  const truncated = rows.length >= ROW_LIMIT;

  // ── Time windows ─────────────────────────────────────────────────────────
  const now = Date.now();
  const t30d = now - 30 * 24 * 60 * 60 * 1000;
  const t7d = now - 7 * 24 * 60 * 60 * 1000;

  const rows30 = rows.filter((r) => new Date(r.started_at).getTime() >= t30d);
  const rows7 = rows.filter((r) => new Date(r.started_at).getTime() >= t7d);

  // ── Section A — Headline tiles ───────────────────────────────────────────
  const tile = (subset: AnalyticsRow[]) => {
    const total = subset.length;
    const totalDur = subset.reduce((acc, r) => acc + (r.duration_seconds ?? 0), 0);
    const avgDur = total > 0 ? Math.round(totalDur / total) : 0;
    const booked = subset.filter((r) => r.booked_booking_id !== null).length;
    const conv = total > 0 ? Math.round((booked / total) * 100) : 0;

    const latencies: number[] = [];
    for (const r of subset) {
      for (const t of readToolInvocations(r.raw_jsonb)) {
        const ms = toolLatency(t);
        if (ms !== null) latencies.push(ms);
      }
    }
    latencies.sort((a, b) => a - b);
    const p50 = percentile(latencies, 0.5);
    const p95 = percentile(latencies, 0.95);

    return { total, avgDur, booked, conv, p50, p95 };
  };

  const tileAll = tile(rows);
  const tile30 = tile(rows30);
  const tile7 = tile(rows7);

  // ── Section B — Booking funnel (30d) ────────────────────────────────────
  const stage1 = rows30.length;
  const stage2 = rows30.filter((r) => (r.tool_call_count ?? 0) > 0).length;
  const stage3 = rows30.filter((r) => r.booked_booking_id !== null).length;
  const pct = (n: number) => (stage1 > 0 ? Math.round((n / stage1) * 100) : 0);
  const drop12 = stage1 - stage2;
  const drop23 = stage2 - stage3;

  // ── Section C — Hour-of-day heatmap (30d, Europe/Warsaw) ────────────────
  const hourCounts: number[] = Array.from({ length: 24 }, () => 0);
  for (const r of rows30) {
    const h = hourInWarsaw(r.started_at);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const hourMax = Math.max(1, ...hourCounts);

  // ── Section D — Repeat callers (30d, PSTN with caller_phone_e164) ───────
  const callerGroups = new Map<string, { count: number; first: string; last: string }>();
  for (const r of rows30) {
    if (!r.caller_phone_e164) continue;
    const existing = callerGroups.get(r.caller_phone_e164);
    if (existing) {
      existing.count += 1;
      if (r.started_at < existing.first) existing.first = r.started_at;
      if (r.started_at > existing.last) existing.last = r.started_at;
    } else {
      callerGroups.set(r.caller_phone_e164, {
        count: 1,
        first: r.started_at,
        last: r.started_at,
      });
    }
  }
  const repeatCallers = Array.from(callerGroups.entries())
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  // ── Section E — Per-tool latency percentiles (30d) ──────────────────────
  const toolMap = new Map<string, { latencies: number[]; errors: number; total: number }>();
  for (const r of rows30) {
    for (const t of readToolInvocations(r.raw_jsonb)) {
      const name = toolName(t);
      const existing = toolMap.get(name) ?? { latencies: [], errors: 0, total: 0 };
      existing.total += 1;
      if (toolErrored(t)) existing.errors += 1;
      const ms = toolLatency(t);
      if (ms !== null) existing.latencies.push(ms);
      toolMap.set(name, existing);
    }
  }
  // ── Section F — Knowledge-layer (RAG retrieval) — last 30 days ──────────
  // Aggregate across the same 30d window the rest of the page uses.
  const ragAgg = aggregateRagStats(rows30.map((r) => r.raw_jsonb));
  const ontologyIdsCsv = process.env.ELEVENLABS_ONTOLOGY_KB_DOC_IDS ?? "";
  const ontologyIds = ontologyIdsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Order must mirror ONTOLOGY_DOC_NAMES in backend/orchestration. Hard-coded
  // here as the friendly labels are not exposed via API.
  const ontologyLabels = [
    "ontology/services.md",
    "ontology/triage.md",
    "ontology/emergency-keywords.md",
  ];
  const ontologyIdToLabel = new Map<string, string>(
    ontologyIds.map((id, i) => [id, ontologyLabels[i] ?? `ontology-${i}`]),
  );
  const ragByDoc = ragAgg.byDoc.map(({ docId, count }) => ({
    docId,
    count,
    label: ontologyIdToLabel.get(docId) ?? "per-clinic / unknown",
    isOntology: ontologyIdToLabel.has(docId),
  }));

  const toolStats = Array.from(toolMap.entries())
    .map(([name, v]) => {
      const sorted = [...v.latencies].sort((a, b) => a - b);
      return {
        name,
        count: v.total,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        errorRate: v.total > 0 ? Math.round((v.errors / v.total) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/test/${providerAgentId}` as Route}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← {clinic}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Analytics</h1>
          <p className="font-mono text-xs text-neutral-400">{providerAgentId}</p>
        </div>
        <Link
          href={`/dashboard/agents/${providerAgentId}/conversations` as Route}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          View conversations →
        </Link>
      </header>

      {truncated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing first {ROW_LIMIT} calls — analytics may be partial.
        </div>
      ) : null}

      {/* ── Section A — Headline tiles ─────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TileGroup title="Last 7 days" data={tile7} />
        <TileGroup title="Last 30 days" data={tile30} />
        <TileGroup title="All time" data={tileAll} />
      </section>

      {/* ── Section B — Funnel ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Booking funnel</h2>
        <p className="text-xs text-neutral-500">Last 30 days</p>
        <div className="mt-4 flex flex-col gap-2">
          <FunnelBar
            label="Calls received"
            count={stage1}
            percentage={100}
            stageMax={stage1}
            color="bg-neutral-300"
          />
          {drop12 > 0 ? <DropArrow drop={drop12} stage1={stage1} /> : null}
          <FunnelBar
            label="Agent took action (≥1 tool call)"
            count={stage2}
            percentage={pct(stage2)}
            stageMax={stage1}
            color="bg-emerald-300"
          />
          {drop23 > 0 ? <DropArrow drop={drop23} stage1={stage1} /> : null}
          <FunnelBar
            label="Booked"
            count={stage3}
            percentage={pct(stage3)}
            stageMax={stage1}
            color="bg-emerald-500"
          />
        </div>
      </section>

      {/* ── Section C — Hour-of-day ────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Calls by hour</h2>
        <p className="text-xs text-neutral-500">Last 30 days · Europe/Warsaw</p>
        <div className="mt-4 flex h-40 items-end gap-1">
          {hourCounts.map((count, h) => {
            const heightPct = Math.round((count / hourMax) * 100);
            return (
              <div
                key={h}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${String(h).padStart(2, "0")}:00 · ${count} ${count === 1 ? "call" : "calls"}`}
              >
                <div
                  className="w-full rounded-t bg-emerald-400"
                  style={{ height: `${heightPct}%`, minHeight: count > 0 ? "2px" : "0px" }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-neutral-400">
          {hourCounts.map((_, h) => (
            <div key={h} className="flex flex-1 justify-center">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section D — Repeat callers ─────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Repeat callers</h2>
        <p className="text-xs text-neutral-500">Last 30 days · PSTN only · phone digits masked</p>
        {repeatCallers.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            No repeat callers in this window (or no PSTN traffic yet).
          </p>
        ) : (
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-2">Phone</th>
                <th className="py-2">Calls</th>
                <th className="py-2">First</th>
                <th className="py-2">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {repeatCallers.map(([phone, v]) => (
                <tr key={phone}>
                  <td className="py-2 font-mono text-xs">{maskPhone(phone)}</td>
                  <td className="py-2">{v.count}</td>
                  <td className="py-2 text-xs text-neutral-600">{formatShortDateTime(v.first)}</td>
                  <td className="py-2 text-xs text-neutral-600">{formatShortDateTime(v.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Section F — Knowledge layer / RAG ──────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Knowledge layer</h2>
            <p className="text-xs text-neutral-500">
              Last 30 days · what the agent had loaded each turn
            </p>
          </div>
          <Link
            href={"/dashboard/ontology" as Route}
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            Ontology dashboard →
          </Link>
        </div>

        {/* Always-on context — system prompt + tools never change per turn */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                System prompt
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                Always on
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-700">
              Personality, language mirroring, goal flow, guardrails, tool usage policy. Loaded on
              every agent turn.
            </p>
            <p className="mt-1 font-mono text-[11px] text-neutral-400">
              source: apps/backend/src/prompts/system-prompt.ts
            </p>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Tools attached
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                Always on
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              <li>
                <code className="font-mono text-xs">check_availability</code>
                <span className="ml-2 text-neutral-500">proposes up to 3 slots</span>
              </li>
              <li>
                <code className="font-mono text-xs">create_booking</code>
                <span className="ml-2 text-neutral-500">confirms a slot to a booking</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Variable — RAG retrieval from KB documents */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              RAG retrieval
            </h3>
            <span className="font-mono text-xs text-neutral-400">
              {ragAgg.turnsWithRetrieval} / {ragAgg.totalAgentTurns} agent turns ·{" "}
              {ragAgg.conversationsWithRetrieval} / {ragAgg.totalConversations} calls
            </span>
          </div>
          {ragAgg.byDoc.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              No knowledge retrievals in the last 30 days. Either no patient asked an
              information-seeking question, or every reply was served by the system prompt alone.
            </p>
          ) : (
            <table className="mt-3 min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-2">Document</th>
                  <th className="py-2">Layer</th>
                  <th className="py-2">Turn hits</th>
                  <th className="py-2">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ragByDoc.map((d) => {
                  const share =
                    ragAgg.turnsWithRetrieval > 0
                      ? Math.round((d.count / ragAgg.turnsWithRetrieval) * 100)
                      : 0;
                  return (
                    <tr key={d.docId}>
                      <td className="py-2 font-mono text-xs text-neutral-700">
                        {d.label}
                        <span className="ml-2 text-neutral-400">{d.docId.slice(0, 12)}…</span>
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            d.isOntology
                              ? "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-700"
                              : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800"
                          }
                        >
                          {d.isOntology ? "Ontology" : "Tenant / unknown"}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums">{d.count}</td>
                      <td className="py-2 tabular-nums text-neutral-600">{share}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Section E — Per-tool latency ───────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Tool latency</h2>
        <p className="text-xs text-neutral-500">Last 30 days</p>
        {toolStats.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No tool calls in this window.</p>
        ) : (
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-2">Tool</th>
                <th className="py-2">Count</th>
                <th className="py-2">p50</th>
                <th className="py-2">p95</th>
                <th className="py-2">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {toolStats.map((t) => (
                <tr key={t.name}>
                  <td className="py-2 font-mono text-xs">{t.name}</td>
                  <td className="py-2">{t.count}</td>
                  <td className="py-2">{t.p50 !== null ? `${t.p50}ms` : "—"}</td>
                  <td className="py-2">{t.p95 !== null ? `${t.p95}ms` : "—"}</td>
                  <td className="py-2">
                    <span
                      className={
                        t.errorRate > 0
                          ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800"
                          : "text-xs text-neutral-500"
                      }
                    >
                      {t.errorRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function TileGroup({
  title,
  data,
}: {
  title: string;
  data: {
    total: number;
    avgDur: number;
    booked: number;
    conv: number;
    p50: number | null;
    p95: number | null;
  };
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Metric label="Calls" value={String(data.total)} />
        <Metric label="Avg dur" value={formatDurationMs(data.avgDur)} />
        <Metric label="Booked" value={String(data.booked)} />
        <Metric label="Conv %" value={`${data.conv}%`} />
        <Metric label="Tool p50" value={data.p50 !== null ? `${data.p50}ms` : "—"} />
        <Metric label="Tool p95" value={data.p95 !== null ? `${data.p95}ms` : "—"} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</span>
      <span className="text-base font-semibold text-neutral-900">{value}</span>
    </div>
  );
}

function FunnelBar({
  label,
  count,
  percentage,
  stageMax,
  color,
}: {
  label: string;
  count: number;
  percentage: number;
  stageMax: number;
  color: string;
}) {
  const widthPct = stageMax > 0 ? Math.max(2, Math.round((count / stageMax) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className="font-mono text-xs text-neutral-500">
          {count} · {percentage}%
        </span>
      </div>
      <div className="h-7 w-full overflow-hidden rounded-md bg-neutral-100">
        <div className={`h-full ${color} transition-[width]`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

function DropArrow({ drop, stage1 }: { drop: number; stage1: number }) {
  const pctDrop = stage1 > 0 ? Math.round((drop / stage1) * 100) : 0;
  return (
    <div className="pl-2 text-xs text-neutral-500">
      ↓ −{drop} ({pctDrop}%)
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

interface PhoneLineAgent {
  agent_id: string;
  el_virtual_e164: string | null;
  agents: {
    provider_agent_id: string;
    pin_code: string | null;
    tenants: { display_name: string } | null;
  } | null;
}

interface PhoneLine {
  id: string;
  e164: string;
  mode: "direct" | "pin";
  status: string;
  created_at: string;
  phone_line_agents: PhoneLineAgent[];
}

interface PhoneLinesResponse {
  lines: PhoneLine[];
}

interface AssignResponse {
  ok: boolean;
  mode: "direct" | "pin";
}

interface AssignErrorResponse {
  error: string;
  message?: string;
}

interface Props {
  providerAgentId: string;
  pinCode: string | null;
}

/**
 * Operator-only panel: deploy this agent onto one of the shared demo phone
 * lines in the pool. When the line already has an agent, adding a second one
 * switches the line to PIN mode — all callers will be asked for a 6-digit code.
 */
export default function PhoneLinePanel({ providerAgentId, pinCode }: Props) {
  const [lines, setLines] = useState<PhoneLine[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/phone-lines");
      const json = (await res.json()) as PhoneLinesResponse | AssignErrorResponse;
      if (!res.ok) {
        const err = json as AssignErrorResponse;
        setError(err.message ?? err.error ?? `HTTP ${res.status}`);
        return;
      }
      setLines((json as PhoneLinesResponse).lines);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLines();
  }, [fetchLines]);

  // Determine if this agent is already deployed on any line.
  const deployedLine = lines?.find((l) =>
    l.phone_line_agents.some((pla) => pla.agents?.provider_agent_id === providerAgentId),
  );

  async function handleAssign(line: PhoneLine) {
    const hasExistingAgents = line.phone_line_agents.length >= 1;
    if (hasExistingAgents) {
      const ok = window.confirm(
        "This line will switch to PIN mode — all callers will be asked for a 6-digit code. Continue?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/phone-lines/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", lineId: line.id, providerAgentId }),
      });
      const json = (await res.json()) as AssignResponse | AssignErrorResponse;
      if (!res.ok) {
        const err = json as AssignErrorResponse;
        setError(err.message ?? err.error ?? `Failed (${res.status})`);
        return;
      }
      await fetchLines();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(line: PhoneLine) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/phone-lines/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unassign", lineId: line.id, providerAgentId }),
      });
      const json = (await res.json()) as AssignResponse | AssignErrorResponse;
      if (!res.ok) {
        const err = json as AssignErrorResponse;
        setError(err.message ?? err.error ?? `Failed (${res.status})`);
        return;
      }
      await fetchLines();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyEmailSnippet(line: PhoneLine) {
    const text =
      line.mode === "pin"
        ? `Zadzwoń: ${line.e164}, kod dostępu: ${pinCode ?? "(wygeneruj PIN)"}`
        : `Zadzwoń: ${line.e164}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed — select and copy the text manually.");
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Phone demo line</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Deploy this agent onto a shared demo phone line. Prospects call a real Polish number —
            no browser needed.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-neutral-400">Loading pool…</p>
      ) : deployedLine ? (
        // Deployed state: show the line details + actions.
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wider text-emerald-700">Deployed on</p>
              <p className="font-mono text-xl font-semibold text-emerald-900">
                {deployedLine.e164}
              </p>
              <span
                className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  deployedLine.mode === "pin"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {deployedLine.mode === "pin" ? "PIN required" : "direct"}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                onClick={() => void copyEmailSnippet(deployedLine)}
                disabled={busy}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? "Copied ✓" : "Copy email snippet"}
              </button>
              <button
                onClick={() => void handleUnassign(deployedLine)}
                disabled={busy}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Removing…" : "Remove from line"}
              </button>
            </div>
          </div>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
      ) : lines?.length === 0 ? (
        // Empty pool.
        <p className="text-sm text-neutral-400">No phone lines in the pool yet.</p>
      ) : (
        // Pool view: list available lines.
        <div className="flex flex-col gap-3">
          {(lines ?? []).map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="font-mono text-sm font-semibold text-neutral-900">{line.e164}</p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      line.mode === "pin"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {line.mode === "pin" ? "PIN required" : "direct"}
                  </span>
                  <span>
                    {line.phone_line_agents.length === 0
                      ? "no agents"
                      : line.phone_line_agents.length === 1
                        ? "1 agent"
                        : `${line.phone_line_agents.length} agents`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => void handleAssign(line)}
                disabled={busy}
                className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deploying…" : "Deploy here"}
              </button>
            </div>
          ))}

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
      )}
    </section>
  );
}

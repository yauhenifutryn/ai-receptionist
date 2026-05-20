"use client";

import { useState } from "react";

interface Props {
  providerAgentId: string;
  initialPin: string | null;
  origin: string;
}

/**
 * Operator-only panel: manage the PIN that gates the public sales-demo
 * route at /demo/<agentId>?pin=X. Generates a fresh 4-digit PIN on demand
 * and gives the operator a copy-to-clipboard shareable URL.
 */
export default function DemoAccessPanel({
  providerAgentId,
  initialPin,
  origin,
}: Props) {
  const [pin, setPin] = useState<string | null>(initialPin);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoUrl = pin
    ? `${origin}/demo/${providerAgentId}?pin=${pin}`
    : null;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${providerAgentId}/pin`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setError(j.message ?? `HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as { pin: string };
      setPin(json.pin);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!demoUrl) return;
    try {
      await navigator.clipboard.writeText(demoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the input. Modern browsers should allow clipboard
      // writeText on user gesture, so this branch is rare.
      setError("Could not copy — select and copy the URL manually.");
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Demo access</h2>
          <p className="mt-1 text-xs text-neutral-500">
            PIN-gated public demo URL for cold outreach to prospects. No
            operator login required for the prospect.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Current PIN
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-neutral-900">
              {pin ?? "— not set —"}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : pin ? "Regenerate" : "Generate PIN"}
          </button>
        </div>

        {demoUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Demo URL (send to prospect)
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2">
              <input
                type="text"
                value={demoUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg bg-neutral-50 px-3 py-2 text-xs font-mono text-neutral-700"
              />
              <button
                onClick={copyLink}
                className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-xs text-rose-600">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

interface Props {
  providerAgentId: string;
  initialPin: string | null;
  origin: string;
}

/**
 * Per-row demo-access controls on the operator dashboard.
 * Compact single-row layout when a PIN exists; falls back to a
 * "Generate" prompt when not.
 */
export default function AgentDemoActions({ providerAgentId, initialPin, origin }: Props) {
  const [pin, setPin] = useState<string | null>(initialPin);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demoUrl = pin ? `${origin}/demo/${providerAgentId}?pin=${pin}` : null;

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
      setError("Copy failed");
    }
  }

  if (!pin) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">no PIN</span>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "…" : "Generate"}
        </button>
        {error ? <span className="text-[10px] text-rose-600">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 p-1">
      <span
        className="rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-neutral-800"
        title="PIN gate for the demo URL"
      >
        {pin}
      </span>
      <button
        onClick={copyLink}
        title="Copy demo URL to clipboard"
        className="rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-white"
      >
        {copied ? "✓" : "Copy"}
      </button>
      <a
        href={demoUrl!}
        target="_blank"
        rel="noopener noreferrer"
        title="Open demo URL in a new tab"
        className="rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-white"
      >
        Open
      </a>
      <button
        onClick={generate}
        disabled={generating}
        title="Regenerate PIN (invalidates old URL)"
        className="rounded-full px-2 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-white hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generating ? "…" : "↻"}
      </button>
      {error ? <span className="ml-1 text-[10px] text-rose-600">{error}</span> : null}
    </div>
  );
}

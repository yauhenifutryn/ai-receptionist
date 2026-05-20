"use client";

import { useState } from "react";

interface Props {
  providerAgentId: string;
  initialPin: string | null;
  origin: string;
}

/**
 * Per-row demo-access controls on the operator dashboard:
 *   • PIN display + Generate/Regenerate (POSTs /api/agents/<id>/pin)
 *   • Copy demo URL (https://<origin>/demo/<agentId>?pin=XXXX)
 *   • Preview as client (opens that URL in a new tab)
 *
 * Designed for inline use inside a table row — compact, no modal.
 */
export default function AgentDemoActions({
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
      setError("Copy failed — select the URL in /test page and copy manually.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-neutral-600">
          {pin ? `PIN ${pin}` : "no PIN"}
        </span>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "…" : pin ? "Regen" : "Generate"}
        </button>
      </div>
      {pin && demoUrl ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyLink}
            className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <a
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            Preview
          </a>
        </div>
      ) : null}
      {error ? <p className="text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";

/**
 * Collapsible operator-only help text explaining what EL evaluation
 * criteria do. Kept as a separate client component so the parent
 * status card can stay a server component (and probe the EL API
 * with the server-side API key).
 */
export function ELAnalysisHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-neutral-500 underline decoration-dotted underline-offset-4 hover:text-neutral-800"
      >
        {open ? "Hide help" : "What is this?"}
      </button>
      {open ? (
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-600">
          Configure evaluation criteria in EL&apos;s dashboard to auto-score every call (sentiment,
          escalation correctness, RODO-consent capture, etc.). Each criterion runs after the call
          ends and lands in <code className="font-mono">raw_jsonb.analysis</code> on the matching
          conversation row. See <code className="font-mono">docs/el-analysis-setup.md</code> for a
          step-by-step walkthrough and suggested Polish-dental criteria.
        </p>
      ) : null}
    </div>
  );
}

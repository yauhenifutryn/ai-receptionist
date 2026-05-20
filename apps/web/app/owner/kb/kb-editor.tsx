"use client";

import { useEffect, useState } from "react";

interface KnowledgeState {
  markdown: string;
  documentId: string | null;
  documentName: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Client KB editor. Loads current markdown from /api/owner/kb on mount,
 * supports edit + save. The save endpoint uploads a new document and
 * swaps the agent over to it (old docs are kept for manual rollback —
 * matches the operator-side semantics).
 *
 * Empty-state hint surfaces when the loaded markdown is blank, which
 * happens for tenants whose initial Firecrawl scrape produced no content
 * or for which the operator hasn't (re)scraped yet.
 */
export default function KbEditor() {
  const [markdown, setMarkdown] = useState("");
  const [initialMarkdown, setInitialMarkdown] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/owner/kb");
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as KnowledgeState;
        if (cancelled) return;
        setMarkdown(json.markdown ?? "");
        setInitialMarkdown(json.markdown ?? "");
        setDocumentName(json.documentName ?? "knowledge");
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = markdown !== initialMarkdown;
  const empty = !loading && initialMarkdown.trim().length === 0;

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/owner/kb", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown,
          documentName: documentName || "knowledge",
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          body?: string;
          error?: string;
          message?: string;
        };
        throw new Error(j.body ?? j.message ?? j.error ?? `Failed (${res.status})`);
      }
      setStatus("saved");
      setInitialMarkdown(markdown);
      setLastSavedAt(new Date());
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm">
        Loading current knowledge base…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
        Failed to load knowledge base: {loadError}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      {empty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your knowledge base is empty. The operator imports your clinic info from your website
          during onboarding — ask them to (re)scrape if it&apos;s missing. You can also paste your
          content here directly.
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Markdown</h2>
        <div className="flex items-center gap-3 text-xs">
          {status === "saved" ? (
            <span className="text-emerald-700">Saved</span>
          ) : lastSavedAt ? (
            <span className="text-neutral-500">
              Last saved {lastSavedAt.toLocaleTimeString("pl-PL")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status === "saving" || markdown.trim().length < 20}
            className="rounded-full bg-neutral-900 px-4 py-1.5 font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        rows={24}
        placeholder="Klinika …&#10;Lekarze …&#10;Usługi i ceny …&#10;FAQ …"
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none"
      />
      <p className="text-xs text-neutral-500">
        {markdown.length.toLocaleString()} characters
        {markdown.trim().length < 20 ? " · need at least 20 characters to save" : ""}
      </p>

      {status === "error" && errorMsg ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {errorMsg}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Route } from "next";
import { useEffect, useRef, useState } from "react";
import { mergePartials } from "@ai-receptionist/backend/scraper/merge-partials";
import type { ScraperOutput } from "@ai-receptionist/contracts";

type Step = "input" | "preparing" | "review" | "provisioning";

interface CoverageWarning {
  severity: "critical" | "high" | "medium";
  code: string;
  message: string;
  suggestion?: string;
}

interface CoverageReport {
  score: number;
  warnings: CoverageWarning[];
  details: {
    tenantName: string;
    hasPhone: boolean;
    hasAddress: boolean;
    hasEmail: boolean;
    hasHours: boolean;
    servicesCount: number;
    servicesWithPrices: number;
    staffCount: number;
    faqCount: number;
  };
}

interface PrepareResponse {
  suggestedTenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  sessionSlug?: string;
  coverage?: CoverageReport;
  scraperSummary: {
    sourceUrl: string;
    scrapedAt: string;
    urlsMapped: number;
    urlsDroppedByFilter: number;
    pagesScraped: number;
    servicesCount: number;
    staffCount: number;
    faqCount: number;
    hasUnknownPrices: boolean;
  };
}

interface ProvisionResponse {
  tenantId: string;
  agentId: string;
  browserTestUrl: string;
  knowledgeDocumentId: string;
}

interface RecentAgent {
  agentId: string;
  tenantName: string;
  sourceUrl?: string;
  provisionedAt: number;
}

/** Mirror of the server DraftDTO (apps/web/app/api/drafts/route.ts). Kept
 *  local because that module pulls server-only Supabase helpers. */
interface DraftDTO {
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  tenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  coverage: unknown;
  scraperSummary: unknown;
  createdAt: string;
  updatedAt: string;
}

interface DraftState {
  url: string;
  tenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  scraperSummary?: PrepareResponse["scraperSummary"];
  coverage?: CoverageReport;
  sessionSlug?: string;
  step: Step;
}

interface ProgressLine {
  phase: string;
  message: string;
  percent: number;
  timestamp: number;
}

const STORAGE_KEYS = {
  draft: "ai-receptionist:provision:draft-v3",
  recent: "ai-receptionist:provision:recent",
  /** Cached scrape-session slug surviving page reloads, so the user can
   *  resume from the most recent server-side scrape without paying for
   *  Firecrawl + rerank again. Stored as { slug, url, ts }. */
  resumableSession: "ai-receptionist:provision:resumable-session",
} as const;

interface PersistedResumable {
  slug: string;
  url: string;
  ts: number;
}
/** Stale-after window — older cached scrapes are silently dropped on load
 *  so we don't offer to resume something the server may have GC'd. */
const RESUMABLE_TTL_MS = 24 * 60 * 60 * 1000;

const RECENT_LIMIT = 10;

const EMPTY_DRAFT: DraftState = {
  url: "",
  tenantName: "",
  knowledgeMarkdown: "",
  systemPrompt: "",
  step: "input",
};

export default function ProvisionPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentAgent[]>([]);
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  /** Set whenever a prepare run starts and the server emits a session
   *  slug. Cleared on a clean success. If prepare errors after the
   *  scrape phase, this is the slug we offer to resume from. */
  const [resumableSlug, setResumableSlug] = useState<string | null>(null);
  /** URL the cached resumable slug was scraped for — used to auto-resume
   *  when the user pastes the same URL again. */
  const [resumableUrl, setResumableUrl] = useState<string | null>(null);
  /** Lives for one prepare() call. .abort() on this kills the fetch
   *  (and on the server, fires the ReadableStream cancel() handler,
   *  which aborts the in-flight Gemini / Firecrawl calls). */
  const prepareAbortRef = useRef<AbortController | null>(null);
  /** True when the current review was loaded from a server-side cached
   *  draft (same URL re-pasted, or "Continue" from the dashboard) rather
   *  than freshly scraped. Drives the "Loaded saved scrape" banner. */
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  useEffect(() => {
    try {
      // Restore the autosaved form but ALWAYS land on the input step — never
      // auto-jump into a stale review. "Continue an in-progress agent" is the
      // server draft's job: it shows in the dashboard "In progress" section,
      // and re-pasting the URL here reloads it (with the sky "saved result"
      // banner). The browser autosave is only a URL/edit convenience now, not
      // a separate "draft restored" surface.
      const raw = window.localStorage.getItem(STORAGE_KEYS.draft);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftState;
        setDraft({ ...EMPTY_DRAFT, ...parsed, step: "input" });
      }
      const recentRaw = window.localStorage.getItem(STORAGE_KEYS.recent);
      if (recentRaw) {
        const list = JSON.parse(recentRaw) as RecentAgent[];
        if (Array.isArray(list)) setRecent(list);
      }
      // Restore resumable scrape session if it's within TTL. We don't
      // require URL match — that's intentional: if the user pasted a
      // different URL but the previous session is still on disk, the
      // server's resume path validates the cached pages so a mismatch
      // just shows "No cached pages found" rather than misleading data.
      const resumableRaw = window.localStorage.getItem(STORAGE_KEYS.resumableSession);
      if (resumableRaw) {
        const r = JSON.parse(resumableRaw) as PersistedResumable;
        if (
          r &&
          typeof r.slug === "string" &&
          typeof r.ts === "number" &&
          Date.now() - r.ts < RESUMABLE_TTL_MS
        ) {
          setResumableSlug(r.slug);
          if (typeof r.url === "string") setResumableUrl(r.url);
        } else {
          window.localStorage.removeItem(STORAGE_KEYS.resumableSession);
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draft));
    } catch {
      // ignore quota
    }
  }, [draft]);

  /**
   * Look up a server-side cached draft for `url`. Returns the prepared
   * response (ready for the review screen) or null when no cache exists.
   */
  async function fetchCachedDraft(
    url: string,
    signal?: AbortSignal,
  ): Promise<PrepareResponse | null> {
    const res = await fetch(`/api/drafts?url=${encodeURIComponent(url)}`, signal ? { signal } : {});
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { draft?: DraftDTO | null } | null;
    const d = j?.draft;
    if (!d) return null;
    return {
      suggestedTenantName: d.tenantName,
      knowledgeMarkdown: d.knowledgeMarkdown,
      systemPrompt: d.systemPrompt,
      ...(d.coverage ? { coverage: d.coverage as CoverageReport } : {}),
      scraperSummary: d.scraperSummary as PrepareResponse["scraperSummary"],
    };
  }

  /** Load a cached draft for `url` and jump to the review step. Used by the
   *  dashboard "Continue" deep-link. */
  async function loadCachedDraftIntoReview(url: string) {
    setDraft((d) => ({ ...d, url, step: "preparing" }));
    try {
      const cached = await fetchCachedDraft(url);
      if (!cached) {
        // Draft was deleted between dashboard render and click — fall back
        // to the input step with the URL prefilled.
        setDraft((d) => ({ ...d, url, step: "input" }));
        return;
      }
      setLoadedFromCache(true);
      setDraft((d) => ({
        ...d,
        url,
        step: "review",
        tenantName: cached.suggestedTenantName,
        knowledgeMarkdown: cached.knowledgeMarkdown,
        systemPrompt: cached.systemPrompt,
        scraperSummary: cached.scraperSummary,
        ...(cached.coverage ? { coverage: cached.coverage } : {}),
      }));
    } catch {
      setDraft((d) => ({ ...d, url, step: "input" }));
    }
  }

  // "Continue" from the dashboard arrives as ?continue=<source url>. Load
  // that draft straight into review, skipping the input step. Declared after
  // loadCachedDraftIntoReview so it isn't referenced before declaration.
  useEffect(() => {
    let continueUrl: string | null = null;
    try {
      continueUrl = new URLSearchParams(window.location.search).get("continue");
    } catch {
      return;
    }
    if (continueUrl) void loadCachedDraftIntoReview(continueUrl);
    // Run once on mount; loadCachedDraftIntoReview is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushRecent(entry: RecentAgent) {
    setRecent((prev) => {
      const deduped = [entry, ...prev.filter((p) => p.agentId !== entry.agentId)].slice(
        0,
        RECENT_LIMIT,
      );
      try {
        window.localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(deduped));
      } catch {
        // ignore
      }
      return deduped;
    });
  }

  function cancelPrepare() {
    prepareAbortRef.current?.abort();
  }

  async function handlePrepare(
    e: React.FormEvent | null,
    opts: { resumeSlug?: string; skipCache?: boolean; forceFresh?: boolean } = {},
  ) {
    if (e) e.preventDefault();
    setError(null);
    setProgress([]);
    setLoadedFromCache(false);
    setDraft((d) => ({ ...d, step: "preparing" }));
    // Replace any previous controller (a stale one shouldn't exist, but
    // guard anyway so a double-click can't leak two in-flight runs).
    prepareAbortRef.current?.abort();
    const controller = new AbortController();
    prepareAbortRef.current = controller;

    // Cache short-circuit: if this exact URL was already scraped +
    // consolidated, reuse it instead of paying Firecrawl + Gemini again.
    // Bypassed by "Re-scrape fresh" (skipCache) and by the resume path.
    if (!opts.skipCache && !opts.resumeSlug) {
      try {
        const cached = await fetchCachedDraft(draft.url, controller.signal);
        if (cached) {
          setLoadedFromCache(true);
          setDraft((d) => ({
            ...d,
            step: "review",
            tenantName: cached.suggestedTenantName,
            knowledgeMarkdown: cached.knowledgeMarkdown,
            systemPrompt: cached.systemPrompt,
            scraperSummary: cached.scraperSummary,
            ...(cached.coverage ? { coverage: cached.coverage } : {}),
          }));
          if (prepareAbortRef.current === controller) prepareAbortRef.current = null;
          return;
        }
      } catch (err) {
        // A failed cache check shouldn't block a fresh scrape — fall through.
        if ((err as Error).name === "AbortError" || controller.signal.aborted) {
          setDraft((d) => ({ ...d, step: "input" }));
          return;
        }
      }
    }

    // Chunked path (feature-flagged): three short JSON calls orchestrated
    // here in the client. Sidesteps Vercel's 300s function-timeout ceiling
    // by splitting Gemini consolidation across N parallel lambdas. Does NOT
    // support session resume (acceptable for v1; resume is rarely used).
    if (!opts.resumeSlug && process.env.NEXT_PUBLIC_USE_CHUNKED_PROVISION === "true") {
      try {
        const result = await runChunkedPipeline(
          draft.url,
          controller.signal,
          (line) => setProgress((p) => [...p, { ...line, timestamp: Date.now() }]),
          { forceFresh: opts.forceFresh ?? false },
        );
        setResumableSlug(null);
        setResumableUrl(null);
        try {
          window.localStorage.removeItem(STORAGE_KEYS.resumableSession);
        } catch {
          // ignore
        }
        setDraft((d) => ({
          ...d,
          step: "review",
          tenantName: result.suggestedTenantName,
          knowledgeMarkdown: result.knowledgeMarkdown,
          systemPrompt: result.systemPrompt,
          scraperSummary: result.scraperSummary,
          ...(result.coverage ? { coverage: result.coverage } : {}),
        }));
      } catch (err) {
        const e = err as Error;
        const isAbort = e.name === "AbortError" || controller.signal.aborted;
        if (!isAbort) setError(e.message);
        setDraft((d) => ({ ...d, step: "input" }));
      } finally {
        if (prepareAbortRef.current === controller) {
          prepareAbortRef.current = null;
        }
      }
      return;
    }

    // Auto-resume: if the user pasted a URL that exactly matches the
    // cached scrape's URL, skip Firecrawl + rerank and reuse the on-disk
    // pages. Explicit Resume button click bypasses this (it already passes
    // opts.resumeSlug). Mismatch URL = fresh scrape.
    const effectiveResumeSlug =
      opts.resumeSlug ??
      (resumableSlug && resumableUrl && resumableUrl === draft.url ? resumableSlug : undefined);

    try {
      const body: Record<string, unknown> = { url: draft.url };
      if (effectiveResumeSlug) body.resumeSessionSlug = effectiveResumeSlug;
      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setError(text || `Prepare failed (${res.status})`);
        setDraft((d) => ({ ...d, step: "input" }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneResult: PrepareResponse | null = null;
      let errorMsg: string | null = null;
      let liveSlug: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string; [k: string]: unknown };
          try {
            evt = JSON.parse(line) as typeof evt;
          } catch {
            continue;
          }
          if (evt.type === "session") {
            liveSlug = String(evt.slug ?? "") || null;
            if (liveSlug) {
              setResumableSlug(liveSlug);
              setResumableUrl(draft.url);
              try {
                const payload: PersistedResumable = {
                  slug: liveSlug,
                  url: draft.url,
                  ts: Date.now(),
                };
                window.localStorage.setItem(STORAGE_KEYS.resumableSession, JSON.stringify(payload));
              } catch {
                // localStorage quota / disabled — UI-only fallback is fine
              }
            }
          } else if (evt.type === "log") {
            const entry: ProgressLine = {
              phase: String(evt.phase ?? ""),
              message: String(evt.message ?? ""),
              percent: typeof evt.percent === "number" ? evt.percent : 0,
              timestamp: Date.now(),
            };
            setProgress((p) => [...p, entry]);
          } else if (evt.type === "error") {
            errorMsg = String(evt.message ?? evt.code ?? "Unknown error");
          } else if (evt.type === "done") {
            doneResult = evt.payload as PrepareResponse;
          }
        }
      }

      if (errorMsg) {
        setError(errorMsg);
        setDraft((d) => ({ ...d, step: "input" }));
        return;
      }
      if (!doneResult) {
        setError("Stream ended without a result");
        setDraft((d) => ({ ...d, step: "input" }));
        return;
      }

      // Clean success — wipe the resume-slug so we don't offer to resume
      // from a session that already completed.
      setResumableSlug(null);
      setResumableUrl(null);
      try {
        window.localStorage.removeItem(STORAGE_KEYS.resumableSession);
      } catch {
        // ignore
      }
      setDraft((d) => ({
        ...d,
        step: "review",
        tenantName: doneResult.suggestedTenantName,
        knowledgeMarkdown: doneResult.knowledgeMarkdown,
        systemPrompt: doneResult.systemPrompt,
        scraperSummary: doneResult.scraperSummary,
        ...(doneResult.coverage ? { coverage: doneResult.coverage } : {}),
        ...(doneResult.sessionSlug ? { sessionSlug: doneResult.sessionSlug } : {}),
      }));
    } catch (err) {
      // User-initiated cancel: drop silently back to input, no scary error.
      const e = err as Error;
      const isAbort = e.name === "AbortError" || controller.signal.aborted;
      if (!isAbort) setError(e.message);
      setDraft((d) => ({ ...d, step: "input" }));
    } finally {
      // Only clear the ref if this run's controller is still the current one;
      // a concurrent restart would have already replaced it.
      if (prepareAbortRef.current === controller) {
        prepareAbortRef.current = null;
      }
    }
  }

  async function handleProvision() {
    setError(null);
    setDraft((d) => ({ ...d, step: "provisioning" }));
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantName: draft.tenantName,
          knowledgeMarkdown: draft.knowledgeMarkdown,
          systemPrompt: draft.systemPrompt,
          sourceUrl: draft.url,
          ...(draft.sessionSlug ? { sessionSlug: draft.sessionSlug } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? `Provision failed (${res.status})`);
        setDraft((d) => ({ ...d, step: "review" }));
        return;
      }
      const data = json as ProvisionResponse;
      pushRecent({
        agentId: data.agentId,
        tenantName: draft.tenantName,
        sourceUrl: draft.url,
        provisionedAt: Date.now(),
      });
      router.push(`/test/${data.agentId}`);
    } catch (err) {
      setError((err as Error).message);
      setDraft((d) => ({ ...d, step: "review" }));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10 sm:px-8 sm:py-12">
      <Header step={draft.step} />

      {recent.length > 0 && draft.step === "input" ? (
        <RecentAgents
          items={recent}
          onOpen={(id) => router.push(`/test/${id}`)}
          onClear={() => {
            setRecent([]);
            try {
              window.localStorage.removeItem(STORAGE_KEYS.recent);
            } catch {
              // ignore
            }
          }}
        />
      ) : null}

      {(draft.step === "input" || draft.step === "preparing") && (
        <InputCard
          url={draft.url}
          submitting={draft.step === "preparing"}
          onChangeUrl={(url) => setDraft((d) => ({ ...d, url }))}
          onSubmit={(e) => handlePrepare(e)}
          error={error}
          progress={progress}
          resumableSlug={resumableSlug}
          onResume={() => handlePrepare(null, { resumeSlug: resumableSlug! })}
          onCancel={cancelPrepare}
        />
      )}

      {(draft.step === "review" || draft.step === "provisioning") && (
        <ReviewCard
          draft={draft}
          submitting={draft.step === "provisioning"}
          loadedFromCache={loadedFromCache}
          onReconsolidate={() => handlePrepare(null, { skipCache: true, forceFresh: false })}
          onRescrape={() => handlePrepare(null, { skipCache: true, forceFresh: true })}
          onChangeTenantName={(tenantName) => setDraft((d) => ({ ...d, tenantName }))}
          onChangeKnowledge={(knowledgeMarkdown) => setDraft((d) => ({ ...d, knowledgeMarkdown }))}
          onChangeSystemPrompt={(systemPrompt) => setDraft((d) => ({ ...d, systemPrompt }))}
          onBack={() => setDraft((d) => ({ ...d, step: "input" }))}
          onProvision={handleProvision}
          error={error}
        />
      )}
    </div>
  );
}

function Header({ step }: { step: Step }) {
  const stepNumber = step === "input" || step === "preparing" ? 1 : 2;
  return (
    <header className="flex flex-col gap-3">
      <Link
        href={"/dashboard" as Route}
        className="text-sm text-neutral-500 transition hover:text-neutral-800"
      >
        ← Dashboard
      </Link>
      <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
        Step {stepNumber} of 2 · {stepLabel(step)}
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">
        {stepNumber === 1 ? "Provision a new agent" : "Review the generated brief"}
      </h1>
      <p className="max-w-2xl text-neutral-600">
        {stepNumber === 1
          ? "Paste a business URL. Firecrawl ranks pages by relevance, drops obvious junk (blog archives, cookie pages, binaries), then Gemini consolidates the result into a curated knowledge base and drafts a voice-agent system prompt."
          : "Read carefully. Edit anything that's wrong. When you provision, the agent gets exactly what you see here — no surprises in production."}
      </p>
    </header>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case "input":
      return "Paste URL";
    case "preparing":
      return "Scraping + consolidating";
    case "review":
      return "Review + edit";
    case "provisioning":
      return "Provisioning agent";
  }
}

function RecentAgents({
  items,
  onOpen,
  onClear,
}: {
  items: RecentAgent[];
  onOpen: (agentId: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Recent agents
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-neutral-500 transition hover:text-neutral-800"
        >
          Clear
        </button>
      </div>
      <ul className="mt-3 divide-y divide-neutral-100">
        {items.map((r) => (
          <li key={r.agentId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-800">{r.tenantName}</div>
              <div className="truncate font-mono text-xs text-neutral-400">
                {r.sourceUrl ?? r.agentId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpen(r.agentId)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              Open test →
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InputCard(props: {
  url: string;
  submitting: boolean;
  onChangeUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
  progress: ProgressLine[];
  resumableSlug: string | null;
  onResume: () => void;
  onCancel: () => void;
}) {
  const {
    url,
    submitting,
    onChangeUrl,
    onSubmit,
    error,
    progress,
    resumableSlug,
    onResume,
    onCancel,
  } = props;
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <Field
        id="url"
        label="Business website URL"
        hint="Polish-first by default. The agent auto-switches to English or Russian if the caller does — no language picker needed."
      >
        <input
          id="url"
          type="url"
          required
          placeholder="https://klinika-lapka.pl"
          value={url}
          onChange={(e) => onChangeUrl(e.target.value)}
          disabled={submitting}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
        />
      </Field>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="break-words">{error}</div>
        </div>
      ) : null}

      {resumableSlug && !submitting ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <span>
            Cached scrape from last run available — skip Firecrawl + rerank and re-run just
            consolidation.
          </span>
          <button
            type="button"
            onClick={onResume}
            className="shrink-0 rounded-full bg-amber-900 px-3 py-1.5 font-medium text-white shadow-sm transition hover:bg-amber-800"
          >
            Resume from cached scrape →
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-6">
        {submitting ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting || !url}
          className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Preparing…" : "Prepare agent brief"}
          {!submitting ? <span aria-hidden>→</span> : null}
        </button>
      </div>

      {submitting ? <ProgressPanel progress={progress} /> : null}
    </form>
  );
}

function ProgressPanel({ progress }: { progress: ProgressLine[] }) {
  const latest = progress[progress.length - 1];
  const percent = Math.min(100, Math.max(0, latest?.percent ?? 0));
  const lastMessage = latest?.message ?? "Starting…";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {lastMessage}
        </div>
        <span className="font-mono text-xs tabular-nums text-neutral-500">{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress.length > 0 ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed text-neutral-600">
          {progress.map((line, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="shrink-0 text-neutral-400">{formatClock(line.timestamp)}</span>
              <span className="shrink-0 uppercase tracking-wider text-neutral-400">
                [{line.phase}]
              </span>
              <span className="text-neutral-700">{line.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ReviewCard(props: {
  draft: DraftState;
  submitting: boolean;
  loadedFromCache: boolean;
  onReconsolidate: () => void;
  onRescrape: () => void;
  onChangeTenantName: (v: string) => void;
  onChangeKnowledge: (v: string) => void;
  onChangeSystemPrompt: (v: string) => void;
  onBack: () => void;
  onProvision: () => void;
  error: string | null;
}) {
  const {
    draft,
    submitting,
    loadedFromCache,
    onReconsolidate,
    onRescrape,
    onChangeTenantName,
    onChangeKnowledge,
    onChangeSystemPrompt,
    onBack,
    onProvision,
    error,
  } = props;
  const summary = draft.scraperSummary;
  return (
    <div className="flex flex-col gap-6">
      {loadedFromCache && !submitting ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-sky-900">
            <div className="font-medium">Saved result loaded from a previous run</div>
            <div className="text-xs text-sky-700">
              Edit and provision as-is, or regenerate. Re-running consolidation reuses the cached
              scrape (fast); scraping from scratch re-fetches every page.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReconsolidate}
              className="rounded-full bg-sky-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-800"
            >
              Re-run consolidation
            </button>
            <button
              type="button"
              onClick={onRescrape}
              className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 shadow-sm transition hover:bg-sky-100"
            >
              Scrape from scratch
            </button>
          </div>
        </div>
      ) : null}
      {draft.coverage ? <CoverageBanner coverage={draft.coverage} /> : null}
      {summary ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Scrape summary
          </h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Source URL" value={summary.sourceUrl} mono />
            <Row label="URLs mapped" value={String(summary.urlsMapped)} />
            <Row label="Dropped by filter" value={String(summary.urlsDroppedByFilter)} />
            <Row label="Pages scraped" value={String(summary.pagesScraped)} />
            <Row label="Services found" value={String(summary.servicesCount)} />
            <Row label="Staff found" value={String(summary.staffCount)} />
            <Row label="FAQ entries" value={String(summary.faqCount)} />
            <Row
              label="Price honesty"
              value={
                summary.hasUnknownPrices ? "Some unknown — agent will defer" : "All prices present"
              }
            />
          </dl>
          {summary.hasUnknownPrices ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              At least one service has no listed price. Per the system prompt, the agent will say
              <em> nie mam tej informacji</em> instead of guessing.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <Field
          id="tenantName"
          label="Business name"
          hint="This is what the agent says in the greeting. Edit if the scraper got it slightly wrong."
        >
          <input
            id="tenantName"
            type="text"
            required
            value={draft.tenantName}
            onChange={(e) => onChangeTenantName(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>

        <Field
          id="systemPrompt"
          label="System prompt"
          hint="Personality · Environment · Tone · Goal · Guardrails · Tools · Error handling. Includes consent variants in PL/EN/RU so the agent switches based on the caller. Edit if you want different rules or tone."
        >
          <textarea
            id="systemPrompt"
            required
            value={draft.systemPrompt}
            onChange={(e) => onChangeSystemPrompt(e.target.value)}
            disabled={submitting}
            rows={14}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-neutral-500">
            {draft.systemPrompt.length.toLocaleString()} characters
          </p>
        </Field>

        <Field
          id="knowledgeMarkdown"
          label="Knowledge document"
          hint="What the agent retrieves from at runtime. H2 sections become RAG chunks. Hard rule: prices marked 'unknown' must stay unknown — never invent."
        >
          <textarea
            id="knowledgeMarkdown"
            required
            value={draft.knowledgeMarkdown}
            onChange={(e) => onChangeKnowledge(e.target.value)}
            disabled={submitting}
            rows={20}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-neutral-500">
            {draft.knowledgeMarkdown.length.toLocaleString()} characters · auto-saved locally
          </p>
        </Field>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-neutral-100 pt-6">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="text-sm text-neutral-600 transition hover:text-neutral-900 disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onProvision}
            disabled={
              submitting || !draft.tenantName || !draft.knowledgeMarkdown || !draft.systemPrompt
            }
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Provisioning…" : "Provision agent"}
            {!submitting ? <span aria-hidden>→</span> : null}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2 last:border-b-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={`font-medium text-neutral-800 ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function CoverageBanner({ coverage }: { coverage: CoverageReport }) {
  if (coverage.warnings.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-sm font-semibold text-white">
          ✓
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium text-emerald-900">
            Coverage 100% — agent has everything it needs to handle calls
          </div>
          <div className="text-xs text-emerald-700">
            Phone, address, hours, and {coverage.details.servicesWithPrices} of{" "}
            {coverage.details.servicesCount} services with prices.
          </div>
        </div>
      </section>
    );
  }
  const critical = coverage.warnings.filter((w) => w.severity === "critical");
  const high = coverage.warnings.filter((w) => w.severity === "high");
  const medium = coverage.warnings.filter((w) => w.severity === "medium");
  const tone = critical.length > 0 ? "rose" : high.length > 0 ? "amber" : "neutral";
  const palette = {
    rose: {
      border: "border-rose-200",
      bg: "bg-rose-50",
      chip: "bg-rose-500",
      title: "text-rose-900",
      body: "text-rose-800",
    },
    amber: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      chip: "bg-amber-500",
      title: "text-amber-900",
      body: "text-amber-800",
    },
    neutral: {
      border: "border-neutral-200",
      bg: "bg-neutral-50",
      chip: "bg-neutral-500",
      title: "text-neutral-900",
      body: "text-neutral-700",
    },
  }[tone];
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border ${palette.border} ${palette.bg} p-4`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full ${palette.chip} text-sm font-semibold text-white`}
        >
          !
        </span>
        <div className="flex-1">
          <div className={`text-sm font-medium ${palette.title}`}>
            Coverage {Math.round(coverage.score * 100)}% —{" "}
            {critical.length > 0 ? `${critical.length} critical · ` : ""}
            {high.length > 0 ? `${high.length} high · ` : ""}
            {medium.length > 0 ? `${medium.length} medium` : ""}
          </div>
          <div className={`text-xs ${palette.body}`}>
            The scrape missed information the agent will need. Review below and either re-run with a
            fresh URL or add the missing details by editing the knowledge document.
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-2 pl-11">
        {coverage.warnings.map((w) => (
          <li key={w.code} className="text-xs">
            <span
              className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                w.severity === "critical"
                  ? "bg-rose-200 text-rose-900"
                  : w.severity === "high"
                    ? "bg-amber-200 text-amber-900"
                    : "bg-neutral-200 text-neutral-700"
              }`}
            >
              {w.severity}
            </span>
            <span className={palette.body}>{w.message}</span>
            {w.suggestion ? (
              <div className={`mt-0.5 pl-2 italic ${palette.body} opacity-80`}>
                → {w.suggestion}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Chunked-provisioning pipeline (gated by NEXT_PUBLIC_USE_CHUNKED_PROVISION)
//
// Splits the long /api/prepare SSE run into three short JSON calls so the
// Gemini consolidation step can be fanned out into N parallel batches and
// no single lambda hits Vercel's 300s function-timeout ceiling.
//
//   /api/prepare/scrape          → map + filter + rerank + Firecrawl scrape
//   /api/prepare/consolidate-batch → Gemini on N pages (× M batches in parallel)
//   /api/prepare/finalize        → render markdown + system prompt + coverage
//
// Merge between consolidate-batch and finalize is pure-TS (mergePartials),
// dedup keys are Polish-diacritic-stripped lowercase. No state in DB/KV —
// the React component holds the data between calls.
// ────────────────────────────────────────────────────────────────────────

// Smaller batches = each Gemini call finishes faster, lower chance any
// single batch trips Vercel's 300s function-timeout. Higher parallelism
// stays well inside the 2M tokens/min paid-tier limit (4 * 3 * ~12k ≈
// 144k tokens concurrent).
const CHUNK_BATCH_SIZE = 3;
const CHUNK_PARALLELISM = 4;

// Failed Gemini batches are retried this many extra rounds, but ONLY for
// transient failures (timeout / 504 / network). A deterministic failure
// (truncated/unparseable JSON) would just fail the same way, so retrying it
// only wastes minutes — those are dropped immediately and the merge proceeds
// on what succeeded. One round is enough: a transient blip usually clears on
// the next fresh lambda.
const CHUNK_RETRY_ROUNDS = 1;

/** A failure is worth retrying only if it looks transient. Truncated JSON,
 *  schema-validation, and parse errors are deterministic on the same input. */
function isTransientBatchError(why: string): boolean {
  const w = why.toLowerCase();
  if (
    w.includes("json parse") ||
    w.includes("unterminated") ||
    w.includes("zod") ||
    w.includes("validation")
  ) {
    return false;
  }
  return (
    w.includes("timeout") ||
    w.includes("deadline") ||
    w.includes("504") ||
    w.includes("502") ||
    w.includes("503") ||
    w.includes("network") ||
    w.includes("fetch failed") ||
    w.includes("econn")
  );
}

interface PrepareScrapeResponse {
  pages: { url: string; markdown: string }[];
  detectedLanguage: string | null;
  primaryLanguage: string;
  urlsMapped: number;
  urlsDroppedByFilter: number;
  pagesScraped: number;
  pagesFromCache: number;
}

async function runChunkedPipeline(
  url: string,
  signal: AbortSignal,
  emit: (line: Omit<ProgressLine, "timestamp">) => void,
  opts: { forceFresh?: boolean } = {},
): Promise<PrepareResponse> {
  // 1. Scrape (per-page cached server-side; forceFresh re-scrapes all)
  emit({
    phase: "scrape",
    percent: 5,
    message: opts.forceFresh ? `Re-scraping ${url} from scratch` : `Starting scrape of ${url}`,
  });
  const scrapeRes = await fetch("/api/prepare/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, forceFresh: opts.forceFresh ?? false }),
    signal,
  });
  if (!scrapeRes.ok) {
    const j = (await scrapeRes.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(j.message ?? j.error ?? `Scrape failed (${scrapeRes.status})`);
  }
  const scrape = (await scrapeRes.json()) as PrepareScrapeResponse;
  const cacheNote = scrape.pagesFromCache > 0 ? ` (${scrape.pagesFromCache} from cache)` : "";
  emit({
    phase: "scrape",
    percent: 35,
    message: `Scraped ${scrape.pagesScraped} page${scrape.pagesScraped === 1 ? "" : "s"}${cacheNote} · primary language: ${scrape.primaryLanguage}${scrape.detectedLanguage ? " (from root redirect)" : " (default)"}`,
  });

  // 2. Split into batches
  const batches: { url: string; markdown: string }[][] = [];
  for (let i = 0; i < scrape.pages.length; i += CHUNK_BATCH_SIZE) {
    batches.push(scrape.pages.slice(i, i + CHUNK_BATCH_SIZE));
  }
  emit({
    phase: "consolidate",
    percent: 40,
    message: `Consolidating ${batches.length} batch${batches.length === 1 ? "" : "es"} in parallel (Gemini)…`,
  });

  // 3. Parallel consolidate with bounded concurrency, then auto-retry any
  // failed batches up to CHUNK_RETRY_ROUNDS times. A batch may fail (504 /
  // DEADLINE_EXCEEDED if Gemini stalls); since each batch is a fresh lambda,
  // re-running just the failures usually succeeds and beats the timeout.
  // partials[i] stays null for a batch that never succeeds — the merge layer
  // tolerates gaps, so partial KB beats no KB.
  const partials: (ScraperOutput | null)[] = new Array(batches.length).fill(null);
  let completed = 0;

  // Returns the subset of indices that failed TRANSIENTLY (worth retrying).
  // Deterministic failures (truncated/invalid JSON) are logged and dropped.
  async function runBatchIndices(indices: number[]): Promise<number[]> {
    const retryable: number[] = [];
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CHUNK_PARALLELISM, indices.length) },
      async () => {
        while (true) {
          if (signal.aborted) return;
          const k = cursor++;
          if (k >= indices.length) return;
          const i = indices[k]!;
          try {
            const res = await fetch("/api/prepare/consolidate-batch", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ rootUrl: url, pages: batches[i] }),
              signal,
            });
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
              };
              const why = j.message ?? j.error ?? String(res.status);
              if (isTransientBatchError(why)) retryable.push(i);
              emit({
                phase: "consolidate",
                percent: 40 + Math.round((completed / batches.length) * 40),
                message: `Batch ${i + 1}/${batches.length} failed (${why})${
                  isTransientBatchError(why) ? " — will retry" : ""
                }`,
              });
              continue;
            }
            const j = (await res.json()) as { partial: ScraperOutput; geminiMs: number };
            partials[i] = j.partial;
            completed++;
            emit({
              phase: "consolidate",
              percent: 40 + Math.round((completed / batches.length) * 40),
              message: `Consolidated batch ${i + 1}/${batches.length} (${completed} done) · ${(j.geminiMs / 1000).toFixed(1)}s`,
            });
          } catch (err) {
            if (signal.aborted) return;
            const why = (err as Error).message;
            if (isTransientBatchError(why)) retryable.push(i);
            emit({
              phase: "consolidate",
              percent: 40 + Math.round((completed / batches.length) * 40),
              message: `Batch ${i + 1}/${batches.length} errored (${why})${
                isTransientBatchError(why) ? " — will retry" : ""
              }`,
            });
          }
        }
      },
    );
    await Promise.all(workers);
    return retryable;
  }

  let pending = batches.map((_, i) => i);
  pending = await runBatchIndices(pending);
  for (
    let round = 1;
    round <= CHUNK_RETRY_ROUNDS && pending.length > 0 && !signal.aborted;
    round++
  ) {
    emit({
      phase: "consolidate",
      percent: 40 + Math.round((completed / batches.length) * 40),
      message: `Retrying ${pending.length} failed batch${pending.length === 1 ? "" : "es"} (round ${round}/${CHUNK_RETRY_ROUNDS})…`,
    });
    pending = await runBatchIndices(pending);
  }

  const validPartials = partials.filter((p): p is ScraperOutput => p !== null);
  if (validPartials.length === 0) {
    throw new Error(`All ${batches.length} consolidation batches failed after retries`);
  }
  const missing = batches.length - validPartials.length;
  if (missing > 0) {
    emit({
      phase: "consolidate",
      percent: 82,
      message: `${missing} of ${batches.length} batches failed — proceeding with ${validPartials.length} that succeeded`,
    });
  }

  // 4. Merge in JS (pure-TS, instant)
  emit({ phase: "merge", percent: 85, message: "Merging batch outputs…" });
  const merged = mergePartials(validPartials);

  // 5. Finalize: render markdown + system prompt + coverage
  emit({ phase: "render", percent: 92, message: "Drafting agent brief…" });
  const finalRes = await fetch("/api/prepare/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merged,
      rootUrl: url,
      urlsMapped: scrape.urlsMapped,
      urlsDroppedByFilter: scrape.urlsDroppedByFilter,
      pagesScraped: scrape.pagesScraped,
    }),
    signal,
  });
  if (!finalRes.ok) {
    const j = (await finalRes.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(j.message ?? j.error ?? `Finalize failed (${finalRes.status})`);
  }
  const final = (await finalRes.json()) as PrepareResponse;
  emit({ phase: "render", percent: 100, message: "Ready — review the brief below" });
  return final;
}

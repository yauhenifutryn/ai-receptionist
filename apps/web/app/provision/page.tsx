"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "input" | "preparing" | "review" | "provisioning";

interface PrepareResponse {
  suggestedTenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  sessionSlug?: string;
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

interface DraftState {
  url: string;
  tenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  scraperSummary?: PrepareResponse["scraperSummary"];
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
} as const;

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
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  const [progress, setProgress] = useState<ProgressLine[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.draft);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftState;
        const step: Step =
          parsed.step === "review" || parsed.step === "input"
            ? parsed.step
            : "input";
        setDraft({ ...EMPTY_DRAFT, ...parsed, step });
        setRestoredFromDraft(true);
      }
      const recentRaw = window.localStorage.getItem(STORAGE_KEYS.recent);
      if (recentRaw) {
        const list = JSON.parse(recentRaw) as RecentAgent[];
        if (Array.isArray(list)) setRecent(list);
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

  function clearDraft() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setRestoredFromDraft(false);
    try {
      window.localStorage.removeItem(STORAGE_KEYS.draft);
    } catch {
      // ignore
    }
  }

  async function handlePrepare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProgress([]);
    setDraft((d) => ({ ...d, step: "preparing" }));

    try {
      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: draft.url }),
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
          if (evt.type === "log") {
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

      setDraft((d) => ({
        ...d,
        step: "review",
        tenantName: doneResult.suggestedTenantName,
        knowledgeMarkdown: doneResult.knowledgeMarkdown,
        systemPrompt: doneResult.systemPrompt,
        scraperSummary: doneResult.scraperSummary,
        ...(doneResult.sessionSlug ? { sessionSlug: doneResult.sessionSlug } : {}),
      }));
    } catch (err) {
      setError((err as Error).message);
      setDraft((d) => ({ ...d, step: "input" }));
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
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
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
          restoredFromDraft={restoredFromDraft && draft.url !== ""}
          onChangeUrl={(url) => setDraft((d) => ({ ...d, url }))}
          onSubmit={handlePrepare}
          onClearDraft={clearDraft}
          error={error}
          progress={progress}
        />
      )}

      {(draft.step === "review" || draft.step === "provisioning") && (
        <ReviewCard
          draft={draft}
          submitting={draft.step === "provisioning"}
          onChangeTenantName={(tenantName) => setDraft((d) => ({ ...d, tenantName }))}
          onChangeKnowledge={(knowledgeMarkdown) =>
            setDraft((d) => ({ ...d, knowledgeMarkdown }))
          }
          onChangeSystemPrompt={(systemPrompt) =>
            setDraft((d) => ({ ...d, systemPrompt }))
          }
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
  restoredFromDraft: boolean;
  onChangeUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClearDraft: () => void;
  error: string | null;
  progress: ProgressLine[];
}) {
  const { url, submitting, restoredFromDraft, onChangeUrl, onSubmit, onClearDraft, error, progress } = props;
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
    >
      {restoredFromDraft ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span>Draft restored from this browser.</span>
          <button
            type="button"
            onClick={onClearDraft}
            className="font-medium underline transition hover:text-emerald-900"
          >
            Start fresh
          </button>
        </div>
      ) : null}

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
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4 border-t border-neutral-100 pt-6">
        <p className="text-xs text-neutral-500">
          Map (relevance-ranked) → filter junk → scrape top 15 in parallel → Gemini consolidation. 15-40 seconds typical.
        </p>
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
              <span className="shrink-0 uppercase tracking-wider text-neutral-400">[{line.phase}]</span>
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
  onChangeTenantName: (v: string) => void;
  onChangeKnowledge: (v: string) => void;
  onChangeSystemPrompt: (v: string) => void;
  onBack: () => void;
  onProvision: () => void;
  error: string | null;
}) {
  const { draft, submitting, onChangeTenantName, onChangeKnowledge, onChangeSystemPrompt, onBack, onProvision, error } = props;
  const summary = draft.scraperSummary;
  return (
    <div className="flex flex-col gap-6">
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
              value={summary.hasUnknownPrices ? "Some unknown — agent will defer" : "All prices present"}
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
            disabled={submitting || !draft.tenantName || !draft.knowledgeMarkdown || !draft.systemPrompt}
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

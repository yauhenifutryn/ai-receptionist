import Link from "next/link";
import type { Route } from "next";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { requireOperator } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface OntologyFile {
  filename: string;
  title: string;
  summary: string;
  documentId: string | null;
  body: string;
}

// Source of truth: which files get auto-attached as RAG knowledge to every
// agent. Order matches ELEVENLABS_ONTOLOGY_KB_DOC_IDS env CSV and the
// ONTOLOGY_DOC_NAMES constant in apps/backend/src/orchestration/.
const ATTACHED_FILES: Array<{ filename: string; title: string; summary: string }> = [
  {
    filename: "services.md",
    title: "Services",
    summary:
      "Polish dental service taxonomy with PL/EN/RU synonyms, typical durations, NFZ status, example patient phrasings. Pure terminology — no prices, no clinic-specific facts.",
  },
  {
    filename: "triage.md",
    title: "Triage tiers",
    summary:
      "Classification rules for NAGŁY / PILNY / PLANOWY. Defines what each tier IS — concrete agent phrasing comes from the system prompt, not from here.",
  },
  {
    filename: "emergency-keywords.md",
    title: "Emergency keywords",
    summary:
      "Polish phrase patterns mapped to urgency tiers (soft-match >0.75 similarity). Reference data, not script.",
  },
];

const DEMOTED_FILES = [
  {
    filename: "scripts.md",
    reason:
      "Demoted — was a behavior script. Conversation flow now owned by the system prompt to avoid divergence.",
  },
  {
    filename: "consent.md",
    reason:
      "Demoted — duplicated the consent flow in the system prompt. Single source of truth, system prompt.",
  },
];

// Resolve absolute path to apps/backend/ontology relative to the web app at
// runtime. Vercel deploys both apps inside the same monorepo build artifact;
// process.cwd() is apps/web at runtime so we walk up two levels.
const ONTOLOGY_DIR = join(process.cwd(), "..", "backend", "ontology");

async function loadOntology(): Promise<OntologyFile[]> {
  const idsCsv = process.env.ELEVENLABS_ONTOLOGY_KB_DOC_IDS ?? "";
  const ids = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);

  const out: OntologyFile[] = [];
  for (let i = 0; i < ATTACHED_FILES.length; i++) {
    const meta = ATTACHED_FILES[i]!;
    const path = join(ONTOLOGY_DIR, meta.filename);
    let body = "";
    if (existsSync(path)) {
      body = await readFile(path, "utf8");
    }
    out.push({
      filename: meta.filename,
      title: meta.title,
      summary: meta.summary,
      documentId: ids[i] ?? null,
      body,
    });
  }
  return out;
}

export default async function OntologyPage() {
  await requireOperator({ redirectPath: "/dashboard/ontology" });
  const ontology = await loadOntology();
  const attachedCount = ontology.filter((f) => f.documentId).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <Link
          href={"/dashboard" as Route}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-900"
        >
          <span aria-hidden>←</span> All agents
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Ontology</h1>
            <p className="max-w-2xl text-sm text-neutral-600">
              Universal Polish dental reference layer. Auto-attached to every
              agent (new + existing) as RAG knowledge documents. Complementary
              to the system prompt and the per-clinic knowledge base, never a
              replacement.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-emerald-700">
            {attachedCount} of {ATTACHED_FILES.length} attached
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          How this layer works
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-neutral-700">
          <li>
            <strong className="text-neutral-900">System prompt</strong> drives
            agent behavior (greeting, identity, language switching, escalation
            policy, tool usage). Source of truth for what the agent says and
            does.
          </li>
          <li>
            <strong className="text-neutral-900">Per-clinic knowledge</strong>{" "}
            (Layer 2) is the source of truth for clinic-specific facts: prices,
            hours, doctors, NFZ contract, addresses, services offered.
          </li>
          <li>
            <strong className="text-neutral-900">Ontology</strong> (this page,
            Layer 1) is reference terminology. The agent retrieves from it to
            understand WHAT a service IS, WHICH urgency tier a symptom maps to,
            WHICH Polish phrases signal an emergency. It does not script the
            agent.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Attached documents
          </h2>
          <p className="text-sm text-neutral-600">
            Every agent provisioned through this dashboard receives these
            documents automatically. Editing a file at{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
              apps/backend/ontology/
            </code>{" "}
            and re-running{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
              upload-ontology.ts
            </code>{" "}
            rotates the document and triggers backfill across all agents.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {ontology.map((doc) => (
            <details
              key={doc.filename}
              className="group rounded-2xl border border-neutral-200 bg-white shadow-sm transition open:border-neutral-300"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-4 p-6">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
                      {doc.title}
                    </h3>
                    <code className="font-mono text-xs text-neutral-400">
                      {doc.filename}
                    </code>
                  </div>
                  <p className="max-w-3xl text-sm text-neutral-600">{doc.summary}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {doc.documentId ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-700">
                      Live
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-rose-700">
                      Missing
                    </span>
                  )}
                  {doc.documentId ? (
                    <code className="font-mono text-[10px] text-neutral-400">
                      {doc.documentId.slice(0, 16)}…
                    </code>
                  ) : null}
                  <span className="text-xs text-neutral-400 transition group-open:rotate-90">
                    →
                  </span>
                </div>
              </summary>
              <div className="border-t border-neutral-100 bg-neutral-50 p-6">
                {doc.body ? (
                  <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-800">
                    {doc.body}
                  </pre>
                ) : (
                  <p className="text-sm text-rose-700">
                    File missing on disk. Check{" "}
                    <code className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-xs">
                      apps/backend/ontology/{doc.filename}
                    </code>
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Demoted documents (not attached)
        </h2>
        <p className="text-sm text-neutral-600">
          These files exist on disk as internal documentation but are no longer
          attached to agents. They were behavior scripts that overlapped with
          the system prompt and risked drifting the agent off-policy at
          retrieval time.
        </p>
        <ul className="flex flex-col gap-3">
          {DEMOTED_FILES.map((d) => (
            <li
              key={d.filename}
              className="flex flex-col gap-1 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3"
            >
              <div className="flex items-baseline gap-3">
                <code className="font-mono text-xs text-neutral-700">
                  {d.filename}
                </code>
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-700">
                  Demoted
                </span>
              </div>
              <p className="text-xs text-neutral-600">{d.reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

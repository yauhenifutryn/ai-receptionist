"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface DraftListItem {
  id: string;
  sourceUrl: string;
  tenantName: string;
  servicesCount: number | null;
  staffCount: number | null;
  faqCount: number | null;
  createdAt: string;
}

export default function ProvisionDraftsSection({ drafts }: { drafts: DraftListItem[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(id: string, sourceUrl: string) {
    setError(null);
    setDeleting(id);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(j.message ?? j.error ?? `Delete failed (${res.status})`);
        return;
      }
      // The provision page autosaves an in-progress draft to localStorage
      // (separate from the server row). Clear it if it's the same URL, so
      // navigating to /provision doesn't resurrect the deleted draft.
      forgetLocalDraft(sourceUrl);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  if (drafts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          In progress · {drafts.length}
        </h2>
      </div>
      <p className="text-xs text-neutral-500">
        Scraped and consolidated, not yet provisioned. Continue to review and provision, or discard.
      </p>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {drafts.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                  Draft
                </span>
                <span className="truncate font-medium text-neutral-900">{d.tenantName}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-xs text-neutral-400">
                {d.sourceUrl}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                {d.servicesCount != null ? <span>{d.servicesCount} services</span> : null}
                {d.staffCount != null ? <span>{d.staffCount} staff</span> : null}
                {d.faqCount != null ? <span>{d.faqCount} FAQ</span> : null}
                <span>{formatDate(d.createdAt)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/provision?continue=${encodeURIComponent(d.sourceUrl)}` as Route}
                className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-800"
              >
                Continue →
              </Link>
              <button
                type="button"
                onClick={() => onDelete(d.id, d.sourceUrl)}
                disabled={deleting === d.id}
                className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
              >
                {deleting === d.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** localStorage key the provision page autosaves its in-progress draft under.
 *  Must stay in sync with STORAGE_KEYS.draft in app/provision/page.tsx. */
const PROVISION_DRAFT_KEY = "ai-receptionist:provision:draft-v3";

/** Clear the provision page's localStorage draft if it's for `sourceUrl`.
 *  Compared loosely (exact, or ignoring a trailing slash) since the stored
 *  value is the raw URL the user typed. */
function forgetLocalDraft(sourceUrl: string) {
  try {
    const raw = window.localStorage.getItem(PROVISION_DRAFT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { url?: string };
    const a = (parsed.url ?? "").replace(/\/+$/, "");
    const b = sourceUrl.replace(/\/+$/, "");
    if (a && a === b) window.localStorage.removeItem(PROVISION_DRAFT_KEY);
  } catch {
    // ignore corrupt / unavailable storage
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  providerAgentId: string;
  tenantDisplayName: string;
}

/**
 * Operator-only agent management actions: re-sync the EL tools[] block,
 * and delete the agent entirely (EL + Supabase row). Sits below the agent
 * settings panel; collapsible to avoid noise.
 */
export default function AgentManagementPanel({
  providerAgentId,
  tenantDisplayName,
}: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function syncTools() {
    setSyncing(true);
    setSyncOk(false);
    setSyncError(null);
    try {
      const res = await fetch(`/api/agents/${providerAgentId}/sync-tools`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setSyncError(j.message ?? `HTTP ${res.status}`);
        return;
      }
      setSyncOk(true);
      setTimeout(() => setSyncOk(false), 3000);
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function deleteAgent() {
    const confirmed = window.confirm(
      `Delete the agent for "${tenantDisplayName}" permanently?\n\n` +
        `This removes the agent from ElevenLabs and from our database. ` +
        `Bookings and consent logs survive (unlinked). This cannot be undone.`,
    );
    if (!confirmed) return;

    const doubleConfirm = window.prompt(
      `Type DELETE to confirm:`,
    );
    if (doubleConfirm !== "DELETE") {
      setDeleteError("Cancelled — type DELETE exactly to confirm.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/agents/${providerAgentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setDeleteError(j.message ?? `HTTP ${res.status}`);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-base font-semibold">Agent management</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Re-sync the tool catalog on the ElevenLabs side (use after we ship
          new tools) or delete the agent entirely.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm">
            <p className="font-medium text-neutral-900">Sync tools</p>
            <p className="text-xs text-neutral-500">
              Re-PATCHes check_availability + create_booking onto the EL
              agent. Idempotent — safe to run on any agent.
            </p>
          </div>
          <button
            onClick={syncTools}
            disabled={syncing}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Syncing…" : syncOk ? "Synced ✓" : "Sync tools"}
          </button>
        </div>
        {syncError ? (
          <p className="text-xs text-rose-600">{syncError}</p>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-sm">
            <p className="font-medium text-rose-900">Delete agent</p>
            <p className="text-xs text-rose-700">
              Permanently removes the agent from ElevenLabs and from our
              dashboard. Bookings and consent logs survive (unlinked).
            </p>
          </div>
          <button
            onClick={deleteAgent}
            disabled={deleting}
            className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        {deleteError ? (
          <p className="text-xs text-rose-600">{deleteError}</p>
        ) : null}
      </div>
    </section>
  );
}

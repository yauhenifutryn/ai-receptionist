"use client";

import { useCallback, useEffect, useState } from "react";

// No hard limit on owners per tenant — clinics with multiple decision-makers
// can have multiple owners. Each has identical access (read-only conversations,
// KB edits, voice/settings). Granular roles are a future concern; today
// everyone is `role: 'owner'`.

interface OwnerRow {
  email: string;
  status: "active" | "pending";
  user_id?: string;
  signed_in_at?: string | null;
  member_since?: string;
  invitation_id?: string;
  invited_at?: string;
  signin_token_expires_at?: string | null;
  signin_token_consumed_at?: string | null;
}

/**
 * Operator-facing UI to invite a clinic owner. Two paths:
 *
 * 1. "Invite owner" → POST /api/agents/[id]/owner-invite. Records a
 *    tenant_invitations row. The owner can then sign in at /auth/sign-in
 *    and gets an OTP code via Resend.
 *
 * 2. "Generate sign-in link" → POST /api/agents/[id]/owner-signin-link.
 *    Mints a one-time magic-link URL the operator can copy and side-channel
 *    (Slack / WhatsApp / own email). Bypasses Resend's recipient allow-list,
 *    which only delivers to pre-authorized addresses until a custom sending
 *    domain is verified.
 *
 * Both paths upsert the same tenant_invitations row (idempotent on
 * (tenant_id, email)), so it doesn't matter which one the operator runs.
 *
 * Below the invite controls, an "Active owners" table shows the merged
 * list of current members + pending invites for this tenant, with per-row
 * Regenerate-link and Revoke actions.
 */
export default function OwnerInvitePanel({ agentId }: { agentId: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  // Sign-in link state. Kept separate from the invite state so the operator
  // can do both in sequence without flicker.
  const [linkState, setLinkState] = useState<"idle" | "submitting" | "ok" | "err">("idle");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState("");
  const [copied, setCopied] = useState(false);

  // Owners-list state. `refreshKey` is bumped after any mutation (invite,
  // generate-link, revoke) to retrigger the fetch effect below.
  const [refreshKey, setRefreshKey] = useState(0);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [ownersErr, setOwnersErr] = useState<string | null>(null);

  // Two-step revoke: clicking once arms; clicking again within 5s confirms.
  // Tracks the email currently armed and a timer to auto-disarm.
  const [armedRevokeEmail, setArmedRevokeEmail] = useState<string | null>(null);
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOwnersLoading(true);
    setOwnersErr(null);
    void fetch(`/api/agents/${encodeURIComponent(agentId)}/owners`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as {
          owners?: OwnerRow[];
          error?: string;
          message?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setOwners([]);
          setOwnersErr(body.message ?? body.error ?? `Failed (${r.status}).`);
        } else {
          setOwners(body.owners ?? []);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setOwners([]);
        setOwnersErr(err instanceof Error ? err.message : "Unexpected error");
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, refreshKey]);

  // Auto-disarm the revoke confirmation after 5s of inactivity.
  useEffect(() => {
    if (!armedRevokeEmail) return;
    const t = window.setTimeout(() => setArmedRevokeEmail(null), 5000);
    return () => window.clearTimeout(t);
  }, [armedRevokeEmail]);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setMsg("");
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/owner-invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (r.ok) {
        setState("ok");
        setMsg(`Invited ${email}. They sign in at /auth/sign-in with this email.`);
        bumpRefresh();
      } else {
        setState("err");
        setMsg(body.message ?? body.error ?? `Failed (${r.status}).`);
      }
    } catch (err) {
      setState("err");
      setMsg(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  async function generateLink() {
    if (!email) {
      setLinkState("err");
      setLinkErr("Enter the owner email first.");
      return;
    }
    setLinkState("submitting");
    setLinkErr("");
    setLinkUrl("");
    setLinkExpiresAt(null);
    setCopied(false);
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/owner-signin-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        expires_at?: string;
        ttl_days?: number;
        error?: string;
        message?: string;
      };
      if (r.ok && body.url) {
        setLinkState("ok");
        setLinkUrl(body.url);
        setLinkExpiresAt(body.expires_at ?? null);
        bumpRefresh();
      } else {
        setLinkState("err");
        setLinkErr(body.message ?? body.error ?? `Failed (${r.status}).`);
      }
    } catch (err) {
      setLinkState("err");
      setLinkErr(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers block clipboard access in iframes / insecure contexts.
      // Fall back to manual selection by focusing the input below.
      setCopied(false);
    }
  }

  function regenerateForRow(rowEmail: string) {
    // Pre-fill the input and run the existing generate-link flow.
    setEmail(rowEmail);
    // Defer one tick so the input visibly updates before the request fires.
    window.setTimeout(() => {
      void generateLink();
    }, 0);
  }

  async function revokeRow(rowEmail: string) {
    if (armedRevokeEmail !== rowEmail) {
      setArmedRevokeEmail(rowEmail);
      setRevokeErr(null);
      return;
    }
    // Confirmed: fire the DELETE.
    setRevokingEmail(rowEmail);
    setRevokeErr(null);
    try {
      const r = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/owners?email=${encodeURIComponent(rowEmail)}`,
        { method: "DELETE" },
      );
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!r.ok) {
        setRevokeErr(body.message ?? body.error ?? `Failed (${r.status}).`);
      } else {
        bumpRefresh();
      }
    } catch (err) {
      setRevokeErr(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setRevokingEmail(null);
      setArmedRevokeEmail(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Owner access
      </h2>
      <p className="text-sm text-neutral-600">
        Grant a clinic owner access to this agent&apos;s conversations + analytics. They sign in at{" "}
        <code className="font-mono text-xs">/auth/sign-in</code> with the invited email.
      </p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          placeholder="owner@clinic.pl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-[240px] flex-1 rounded border border-neutral-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {state === "submitting" ? "Inviting…" : "Invite owner"}
        </button>
        <button
          type="button"
          onClick={generateLink}
          disabled={linkState === "submitting"}
          className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
        >
          {linkState === "submitting" ? "Generating…" : "Generate sign-in link"}
        </button>
      </form>
      {msg ? (
        <p className={`text-xs ${state === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{msg}</p>
      ) : null}

      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
        Tip: Owner invites also send via email (Resend). Until a custom sending domain is verified,
        only Resend-authorized addresses receive the email. Use &ldquo;Generate sign-in link&rdquo;
        for prospects whose address isn&apos;t pre-authorized.
      </div>

      {linkState === "ok" && linkUrl ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs leading-relaxed text-neutral-600">
            This URL signs the owner in directly without email. Copy and send via your channel of
            choice (Slack, WhatsApp, your own email).
            {linkExpiresAt
              ? ` Valid until ${new Date(linkExpiresAt).toLocaleDateString("pl-PL", { year: "numeric", month: "short", day: "numeric" })}, single-use.`
              : " Valid for ~14 days, single-use."}{" "}
            Treat it like a temporary password &mdash; anyone with the URL signs in as this email
            until first use or expiry. Regenerate to rotate.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              readOnly
              value={linkUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-[280px] flex-1 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-800"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
      {linkState === "err" && linkErr ? <p className="text-xs text-rose-700">{linkErr}</p> : null}

      <div className="mt-2 flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Active owners
        </h3>
        {ownersLoading ? (
          <p className="text-xs text-neutral-500">Loading…</p>
        ) : ownersErr ? (
          <p className="text-xs text-rose-700">{ownersErr}</p>
        ) : owners.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No owners yet. Invite the clinic owner above to grant access.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {owners.map((row) => {
                  const isArmed = armedRevokeEmail === row.email;
                  const isRevoking = revokingEmail === row.email;
                  return (
                    <tr key={`${row.status}-${row.email}`} className="text-neutral-800">
                      <td className="px-3 py-2 font-mono text-[11px]">{row.email}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            row.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-600">
                        {row.status === "active"
                          ? row.signed_in_at
                            ? `Signed in ${formatRelative(row.signed_in_at)}`
                            : row.member_since
                              ? `Member since ${formatDate(row.member_since)}`
                              : "—"
                          : row.invited_at
                            ? `Invited ${formatRelative(row.invited_at)}`
                            : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => regenerateForRow(row.email)}
                            disabled={linkState === "submitting"}
                            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            Regenerate link
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeRow(row.email)}
                            disabled={isRevoking}
                            className={`rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${
                              isArmed
                                ? "bg-rose-600 text-white hover:bg-rose-700"
                                : "border border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                            }`}
                          >
                            {isRevoking ? "Revoking…" : isArmed ? "Click to confirm" : "Revoke"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {revokeErr ? <p className="text-xs text-rose-700">{revokeErr}</p> : null}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) {
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

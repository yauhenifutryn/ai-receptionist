"use client";

import { useState } from "react";

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
 */
export default function OwnerInvitePanel({ agentId }: { agentId: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  // Sign-in link state. Kept separate from the invite state so the operator
  // can do both in sequence without flicker.
  const [linkState, setLinkState] = useState<"idle" | "submitting" | "ok" | "err">(
    "idle",
  );
  const [linkUrl, setLinkUrl] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [copied, setCopied] = useState(false);

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
    setCopied(false);
    try {
      const r = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/owner-signin-link`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        message?: string;
      };
      if (r.ok && body.url) {
        setLinkState("ok");
        setLinkUrl(body.url);
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

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Owner access
      </h2>
      <p className="text-sm text-neutral-600">
        Grant a clinic owner access to this agent&apos;s conversations + analytics. They sign
        in at <code className="font-mono text-xs">/auth/sign-in</code> with the invited
        email.
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
        <p className={`text-xs ${state === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {msg}
        </p>
      ) : null}

      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
        Tip: Owner invites also send via email (Resend). Until a custom sending domain is
        verified, only Resend-authorized addresses receive the email. Use &ldquo;Generate
        sign-in link&rdquo; for prospects whose address isn&apos;t pre-authorized.
      </div>

      {linkState === "ok" && linkUrl ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs leading-relaxed text-neutral-600">
            This URL signs the owner in directly without email. Copy and send via your
            channel of choice (Slack, WhatsApp, your own email). Link is valid for
            ~1 hour and can only be used once &mdash; treat it like a temporary password.
            Once Resend custom-domain delivery is configured, the invited owner will also
            receive the same link by email.
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
      {linkState === "err" && linkErr ? (
        <p className="text-xs text-rose-700">{linkErr}</p>
      ) : null}
    </section>
  );
}

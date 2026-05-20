"use client";

import { useState } from "react";

/**
 * Operator-facing UI to invite a clinic owner. POSTs to
 * /api/agents/[providerAgentId]/owner-invite. On success the invitee can
 * sign in at /auth/sign-in and is materialized into tenant_members on the
 * first OTP verification (see verify-otp route).
 */
export default function OwnerInvitePanel({ agentId }: { agentId: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

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
        setEmail("");
      } else {
        setState("err");
        setMsg(body.message ?? body.error ?? `Failed (${r.status}).`);
      }
    } catch (err) {
      setState("err");
      setMsg(err instanceof Error ? err.message : "Unexpected error");
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
      </form>
      {msg ? (
        <p className={`text-xs ${state === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}

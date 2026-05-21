"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

// ============================================================================
// Operator-only code sign-in. Workaround until Resend custom domain is
// verified. Each operator has a fixed static code (stored in Vercel env)
// that maps to their email. Paste, hit enter, land on /dashboard.
//
// The regular `/auth/sign-in` form is the long-term path: enter email,
// receive a 6-digit code by email, paste it back. That path can't work
// today because Resend sandbox restricts delivery to the account-owner
// email.
//
// Delete this page + /api/auth/operator-code-redeem + OPERATOR_CODE_* env
// vars once Resend domain is verified.
// ============================================================================

export default function OperatorCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/operator-code-redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; redirectTo?: string; message?: string };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Code not recognised.");
        setBusy(false);
        return;
      }
      const next = (body.redirectTo ?? "/dashboard") as Route;
      router.push(next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-20">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
            Operator console
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Sign in with code</h1>
          <p className="text-sm leading-relaxed text-neutral-600">
            Paste the operator code you received from the admin. The code is tied to your identity
            and signs you in to the operator dashboard. Until our email domain is verified, this is
            the way in for trusted operators.
          </p>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              Operator code
            </span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="rem-… or seb-…"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 font-mono text-sm tracking-wide text-neutral-900 outline-none focus:border-neutral-900"
              disabled={busy}
              autoFocus
            />
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <footer className="mt-4 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
          <p>
            Not an operator? Go to the regular sign-in at <span className="font-mono">/auth/sign-in</span>.
          </p>
        </footer>
      </div>
    </div>
  );
}

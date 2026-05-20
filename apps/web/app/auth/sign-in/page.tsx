"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

type Step = "email" | "code";

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 403) {
          setError(
            json.message ??
              "This email isn't on the operator allow-list. Ask the admin to add you.",
          );
        } else {
          setError(json.message ?? json.error ?? `Failed (${res.status})`);
        }
        return;
      }
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token: code, next }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectTo?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 410) {
          setError(
            "Code expired. Request a fresh one — codes are valid for one hour.",
          );
        } else if (res.status === 401) {
          setError("Invalid code. Double-check the email and try again.");
        } else {
          setError(json.message ?? json.error ?? `Failed (${res.status})`);
        }
        return;
      }
      // Full page navigation so the freshly-set session cookies are
      // sent on the very first request to /dashboard.
      window.location.href = json.redirectTo ?? "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 py-16">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Operator sign-in
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-neutral-600">
          {step === "email" ? (
            <>
              Enter your operator email. We&apos;ll send you a one-time 6-digit
              code. Type the code on the next screen and you&apos;re in.
              Session stays valid for ~7 days, then you do this again.
            </>
          ) : (
            <>
              Check your inbox at <strong>{email}</strong>. The email contains
              a 6-digit code — type it below. Ignore the &quot;magic link&quot;
              in the same email; we&apos;ve switched to code entry for Safari
              reliability.
            </>
          )}
        </p>
      </header>

      {step === "email" ? (
        <form
          onSubmit={requestCode}
          className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-neutral-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !email}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending code…" : "Send code"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={verifyCode}
          className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="code" className="text-sm font-medium text-neutral-800">
              6-digit code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="123456"
              pattern="[0-9 \-]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={submitting}
              maxLength={10}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-center font-mono text-lg tracking-widest transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              disabled={submitting}
              className="text-sm text-neutral-500 transition hover:text-neutral-800 disabled:opacity-50"
            >
              ← Different email
            </button>
            <button
              type="submit"
              disabled={submitting || code.replace(/[\s-]/g, "").length < 6}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

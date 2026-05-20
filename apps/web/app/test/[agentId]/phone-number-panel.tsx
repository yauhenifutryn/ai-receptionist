"use client";

import { useState } from "react";

interface ImportNumberResponse {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  agentId: string;
  message: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
  body?: string;
  details?: unknown;
}

/**
 * Operator-only panel: bind a Twilio EU phone number to this agent so a
 * sales rep can send the prospect a "call this number" message. Hidden by
 * default behind an expand toggle so the panel doesn't clutter the test
 * screen.
 *
 * Twilio credentials submitted here are forwarded straight to ElevenLabs
 * and never persisted on our side. Operators must already have:
 *   - A Twilio EU sub-account
 *   - A purchased Polish local number with regulatory bundle
 *   - The number provisioned for voice
 */
export default function PhoneNumberPanel({
  providerAgentId,
  existingPhoneNumber,
}: {
  providerAgentId: string;
  existingPhoneNumber?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [label, setLabel] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<ImportNumberResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (existingPhoneNumber) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-emerald-700">
              PSTN ready
            </div>
            <div className="mt-1 text-lg font-medium text-emerald-900">{existingPhoneNumber}</div>
            <div className="mt-1 text-sm text-emerald-800">
              Send this number to the prospect — they call cold, hear the Polish agent, sign the
              pilot.
            </div>
          </div>
        </div>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/twilio/import-number", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerAgentId,
          phoneNumber,
          label,
          twilioAccountSid,
          twilioAuthToken,
        }),
      });
      const json = (await res.json()) as ImportNumberResponse | ErrorResponse;
      if (!res.ok) {
        const err = json as ErrorResponse;
        setError(err.message ?? err.body ?? err.error ?? `Failed (${res.status})`);
        return;
      }
      setSuccess(json as ImportNumberResponse);
      setTwilioAuthToken(""); // wipe sensitive value from local state on success
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="font-mono text-xs uppercase tracking-wider text-emerald-700">
          Number bound
        </div>
        <div className="mt-1 text-lg font-medium text-emerald-900">{success.phoneNumber}</div>
        <div className="mt-2 text-sm text-emerald-800">{success.message}</div>
        <div className="mt-3 font-mono text-xs text-emerald-700">
          EL phone-number id: {success.elevenLabsPhoneNumberId}
        </div>
      </section>
    );
  }

  if (!expanded) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              Assign phone number
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              Bind a Twilio EU number so a prospect can call this agent cold. Browser test is for
              our QA; phone is the prospect&apos;s wow.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            Open
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Assign Twilio phone number
        </h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-neutral-500 transition hover:text-neutral-800"
        >
          Collapse
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Credentials are forwarded to ElevenLabs once and not stored on our servers. The number must
        be voice-capable and have the Polish regulatory bundle attached before importing.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field id="phoneNumber" label="Phone number (E.164)">
          <input
            id="phoneNumber"
            type="tel"
            required
            placeholder="+48221234567"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>
        <Field id="label" label="Label (shown in ElevenLabs dashboard)">
          <input
            id="label"
            type="text"
            required
            placeholder="Dynasty Stomatology — demo line"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>
        <Field id="twilioAccountSid" label="Twilio Account SID">
          <input
            id="twilioAccountSid"
            type="text"
            required
            placeholder="AC…"
            value={twilioAccountSid}
            onChange={(e) => setTwilioAccountSid(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>
        <Field id="twilioAuthToken" label="Twilio Auth Token">
          <input
            id="twilioAuthToken"
            type="password"
            required
            autoComplete="off"
            value={twilioAuthToken}
            onChange={(e) => setTwilioAuthToken(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={submitting || !phoneNumber || !label || !twilioAccountSid || !twilioAuthToken}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Importing…" : "Import number"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      {children}
    </div>
  );
}

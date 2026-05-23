"use client";

import { useEffect, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Settings {
  sms_confirmations_enabled: boolean;
  zadarmaConfigured: boolean;
}

/**
 * SMS confirmations toggle. Loads current state from /api/owner/settings and
 * writes back via PATCH. Below the toggle, a status card reflects whether the
 * deployment has Zadarma credentials wired:
 *   - configured → emerald confirmation
 *   - missing → amber warning explaining the gap between owner preference and
 *     operator-side credential wiring
 */
export default function SmsToggleCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/owner/settings");
        if (!res.ok) throw new Error(`settings ${res.status}`);
        const json = (await res.json()) as Settings;
        if (cancelled) return;
        setSettings(json);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(nextValue: boolean) {
    if (!settings) return;
    setStatus("saving");
    setErrorMsg(null);
    const prev = settings.sms_confirmations_enabled;
    // Optimistic update — revert on error.
    setSettings({ ...settings, sms_confirmations_enabled: nextValue });
    try {
      const res = await fetch("/api/owner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_confirmations_enabled: nextValue }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setSettings({ ...settings, sms_confirmations_enabled: prev });
      setStatus("error");
      setErrorMsg((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        Loading settings…
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        Couldn&apos;t load settings: {loadError ?? "unknown error"}
      </div>
    );
  }

  const { sms_confirmations_enabled, zadarmaConfigured } = settings;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-neutral-900">SMS confirmations</h2>
            <p className="mt-1 text-sm text-neutral-600">
              When on, every booking triggers a confirmation SMS to the patient with the date, time,
              and a short link to the booking page. When off, no SMS goes out — patients get the
              verbal confirmation from the agent only.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sms_confirmations_enabled}
            disabled={status === "saving"}
            onClick={() => handleToggle(!sms_confirmations_enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              sms_confirmations_enabled ? "bg-emerald-600" : "bg-neutral-300"
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                sms_confirmations_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="mt-3 h-5 text-xs">
          {status === "saved" && <span className="text-emerald-700">Saved.</span>}
          {status === "saving" && <span className="text-neutral-500">Saving…</span>}
          {status === "error" && (
            <span className="text-red-700">Save failed: {errorMsg ?? "unknown error"}</span>
          )}
        </div>
      </div>

      {zadarmaConfigured ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-medium">Zadarma configured.</p>
          <p className="mt-1">SMS will send when this toggle is on.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Zadarma not yet configured.</p>
          <p className="mt-1">
            SMS confirmations use Zadarma. Zadarma credentials are not yet configured in the
            deployment (operator action). The toggle saves your preference, but no SMS will go out
            until both the toggle is on AND credentials are added.
          </p>
        </div>
      )}
    </div>
  );
}

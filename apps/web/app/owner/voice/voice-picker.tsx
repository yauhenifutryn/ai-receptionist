"use client";

import { useEffect, useState } from "react";

interface Voice {
  id: string;
  name: string;
  category: string | null;
  accent: string | null;
  gender: string | null;
  age: string | null;
  useCase: string | null;
  description: string | null;
  previewUrl: string | null;
  verifiedLanguages: string[];
  polishVerified: boolean;
  isDefault: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Owner voice picker. Lists curated voices via /api/owner/voices, reads
 * current selection via GET /api/owner/voice, saves via PATCH on the
 * same route. Clicking a voice tile selects it; "Save" commits.
 *
 * Empty-state notice (currentVoiceId blank) tells the owner they're on
 * the platform default. A non-Polish-verified selection shows an amber
 * warning card matching the operator picker's UX.
 */
export default function VoicePicker() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [currentVoiceId, setCurrentVoiceId] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [voicesRes, voiceRes] = await Promise.all([
          fetch("/api/owner/voices"),
          fetch("/api/owner/voice"),
        ]);
        if (!voicesRes.ok) throw new Error(`voices ${voicesRes.status}`);
        if (!voiceRes.ok) throw new Error(`voice ${voiceRes.status}`);
        const voicesJson = (await voicesRes.json()) as { voices: Voice[] };
        const voiceJson = (await voiceRes.json()) as { voiceId: string };
        if (cancelled) return;
        setVoices(voicesJson.voices ?? []);
        setCurrentVoiceId(voiceJson.voiceId ?? "");
        setSelectedVoiceId(voiceJson.voiceId ?? "");
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

  const dirty = selectedVoiceId !== currentVoiceId && selectedVoiceId.length > 0;
  const selectedVoice = voices.find((v) => v.id === selectedVoiceId);
  const usingPlatformDefault = !currentVoiceId;

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/owner/voice", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoiceId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          body?: string;
          error?: string;
          message?: string;
        };
        throw new Error(j.body ?? j.message ?? j.error ?? `Failed (${res.status})`);
      }
      setStatus("saved");
      setCurrentVoiceId(selectedVoiceId);
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm">
        Loading voices…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
        Failed to load voices: {loadError}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      {usingPlatformDefault ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Currently using the platform default voice. Pick one below to override.
        </div>
      ) : null}

      {selectedVoice && !selectedVoice.polishVerified && !selectedVoice.isDefault ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This voice speaks Polish via the multilingual TTS model, but its native accent is{" "}
          {selectedVoice.accent ?? "non-Polish"}. May sound foreign-accented to your callers. Listen
          to the preview before saving.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">
          {voices.length} curated voices
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {status === "saved" ? <span className="text-emerald-700">Saved</span> : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status === "saving"}
            className="rounded-full bg-neutral-900 px-4 py-1.5 font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
        {voices.map((v) => {
          const isSelected = v.id === selectedVoiceId;
          const isCurrent = v.id === currentVoiceId;
          return (
            <li
              key={v.id}
              className={
                "flex flex-col gap-2 px-4 py-3 transition " +
                (isSelected ? "bg-emerald-50/60" : "bg-white hover:bg-neutral-50")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedVoiceId(v.id)}
                  className="flex flex-1 flex-col items-start gap-0.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "inline-flex h-4 w-4 items-center justify-center rounded-full border " +
                        (isSelected
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-neutral-300 bg-white")
                      }
                    >
                      {isSelected ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </span>
                    <span className="text-sm font-medium text-neutral-900">{v.name}</span>
                    {v.isDefault ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                        recommended
                      </span>
                    ) : v.polishVerified ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                        polish-verified
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                        in use
                      </span>
                    ) : null}
                  </div>
                  <div className="pl-6 text-xs text-neutral-500">
                    {[v.accent, v.gender, v.age].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
                {v.previewUrl ? (
                  <audio
                    controls
                    preload="none"
                    src={v.previewUrl}
                    className="h-8 w-48 shrink-0"
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {status === "error" && errorMsg ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {errorMsg}
        </div>
      ) : null}
    </section>
  );
}

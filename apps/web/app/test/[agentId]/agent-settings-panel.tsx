"use client";

import { useEffect, useState } from "react";

interface AgentConfig {
  providerAgentId: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  language: string;
  knowledgeDocs: { id: string; name: string; type: string }[];
}

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

interface KnowledgeState {
  markdown: string;
  documentId: string | null;
  documentName: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Operator-facing agent editor for /test/[agentId]. Exposes only the fields
 * we'd surface to a clinic in the Chat 3 client dashboard:
 *   - System prompt (agent behavior)
 *   - First message (greeting the agent says on call connect)
 *   - Voice (picked from EL workspace voices)
 *   - Knowledge base markdown (services, doctors, hours, etc.)
 *
 * Everything else (LLM choice, temperature, TTS stability, ASR provider,
 * privacy settings) is operator-locked in elevenlabs-convai.ts and not
 * exposed here.
 */
export default function AgentSettingsPanel({ providerAgentId }: { providerAgentId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || config) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [configRes, voicesRes, kbRes] = await Promise.all([
          fetch(`/api/agents/${encodeURIComponent(providerAgentId)}/config`),
          fetch("/api/voices"),
          fetch(`/api/agents/${encodeURIComponent(providerAgentId)}/knowledge`),
        ]);
        if (cancelled) return;
        if (!configRes.ok) throw new Error(`config ${configRes.status}`);
        if (!voicesRes.ok) throw new Error(`voices ${voicesRes.status}`);
        if (!kbRes.ok) throw new Error(`knowledge ${kbRes.status}`);
        const configJson = (await configRes.json()) as AgentConfig;
        const voicesJson = (await voicesRes.json()) as { voices: Voice[] };
        const kbJson = (await kbRes.json()) as KnowledgeState;
        if (cancelled) return;
        setConfig(configJson);
        setVoices(voicesJson.voices ?? []);
        setKnowledge(kbJson);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, config, providerAgentId]);

  if (!expanded) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              Agent settings
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              Edit system prompt, voice, and knowledge base. Changes apply immediately on the next
              call.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Agent settings
        </h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-neutral-500 transition hover:text-neutral-800"
        >
          Collapse
        </button>
      </div>

      {loading && !config ? (
        <p className="text-sm text-neutral-500">Loading current settings…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load settings: {loadError}
        </div>
      ) : config ? (
        <div className="flex flex-col gap-8">
          <SystemPromptEditor
            providerAgentId={providerAgentId}
            initial={config.systemPrompt}
            initialFirstMessage={config.firstMessage}
          />
          <VoiceEditor providerAgentId={providerAgentId} voices={voices} initial={config.voiceId} />
          <KnowledgeEditor
            providerAgentId={providerAgentId}
            initial={knowledge?.markdown ?? ""}
            initialName={knowledge?.documentName ?? `${config.providerAgentId} — knowledge`}
          />
        </div>
      ) : null}
    </section>
  );
}

function SystemPromptEditor({
  providerAgentId,
  initial,
  initialFirstMessage,
}: {
  providerAgentId: string;
  initial: string;
  initialFirstMessage: string;
}) {
  const [systemPrompt, setSystemPrompt] = useState(initial);
  const [firstMessage, setFirstMessage] = useState(initialFirstMessage);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dirty = systemPrompt !== initial || firstMessage !== initialFirstMessage;

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const body: Record<string, string> = {};
      if (systemPrompt !== initial) body.systemPrompt = systemPrompt;
      if (firstMessage !== initialFirstMessage) body.firstMessage = firstMessage;
      const res = await fetch(`/api/agents/${encodeURIComponent(providerAgentId)}/config`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { body?: string; message?: string }).body ??
            (j as { message?: string }).message ??
            `Failed (${res.status})`,
        );
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <SubSection
      title="Behavior"
      hint="System prompt + greeting. Reads like instructions to the agent: tone, what to do, what to escalate."
      status={status}
      errorMsg={errorMsg}
      dirty={dirty}
      onSave={save}
    >
      <Field id="firstMessage" label="Greeting (first message on call connect)">
        <input
          id="firstMessage"
          type="text"
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none"
        />
      </Field>
      <Field id="systemPrompt" label="System prompt">
        <textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">
          {systemPrompt.length.toLocaleString()} characters
        </p>
      </Field>
    </SubSection>
  );
}

function VoiceEditor({
  providerAgentId,
  voices,
  initial,
}: {
  providerAgentId: string;
  voices: Voice[];
  initial: string;
}) {
  const [voiceId, setVoiceId] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dirty = voiceId !== initial;
  const currentVoice = voices.find((v) => v.id === voiceId);

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(providerAgentId)}/config`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { body?: string; message?: string }).body ??
            (j as { message?: string }).message ??
            `Failed (${res.status})`,
        );
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <SubSection
      title="Voice"
      hint="All voices below are EL-vetted (premade + professional) and work with Polish via the multilingual TTS model. The recommended default at the top is hand-picked for Polish-native sound; others may carry a foreign accent."
      status={status}
      errorMsg={errorMsg}
      dirty={dirty}
      onSave={save}
    >
      <Field id="voiceId" label="Voice">
        <select
          id="voiceId"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none"
        >
          {voices.length === 0 ? (
            <option value="">No voices loaded</option>
          ) : (
            voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.isDefault ? "★ " : v.polishVerified ? "✓ " : ""}
                {v.name}
                {v.accent ? ` · ${v.accent}` : ""}
                {v.gender ? ` · ${v.gender}` : ""}
                {v.age ? ` · ${v.age}` : ""}
                {v.isDefault ? " (recommended for Polish)" : ""}
              </option>
            ))
          )}
        </select>
      </Field>
      {currentVoice ? (
        <div className="flex flex-col gap-2">
          {currentVoice.isDefault ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Recommended Polish-native voice. Best fit for clinic callers.
            </div>
          ) : currentVoice.polishVerified ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              ElevenLabs has verified this voice for Polish.
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This voice will speak Polish via the multilingual TTS model, but its native accent is{" "}
              {currentVoice.accent ?? "non-Polish"}. May sound foreign-accented to callers. Listen
              below before committing.
            </div>
          )}
          {currentVoice.previewUrl ? (
            <div>
              <audio controls preload="none" src={currentVoice.previewUrl} className="w-full">
                Your browser doesn&apos;t support audio playback.
              </audio>
              <p className="mt-1 text-xs text-neutral-500">
                Preview from ElevenLabs. Note: the sample may be in English even though the voice
                can speak Polish via our multilingual TTS model.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </SubSection>
  );
}

function KnowledgeEditor({
  providerAgentId,
  initial,
  initialName,
}: {
  providerAgentId: string;
  initial: string;
  initialName: string;
}) {
  const [markdown, setMarkdown] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dirty = markdown !== initial;

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(providerAgentId)}/knowledge`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown,
          documentName: initialName || "knowledge",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { body?: string; message?: string }).body ??
            (j as { message?: string }).message ??
            `Failed (${res.status})`,
        );
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <SubSection
      title="Knowledge base"
      hint="What the agent retrieves from at runtime (services, prices, doctors, hours). Markdown. Saving uploads a new document and swaps the agent over to it — old documents are kept for rollback."
      status={status}
      errorMsg={errorMsg}
      dirty={dirty}
      onSave={save}
    >
      <Field id="kbMarkdown" label="Markdown">
        <textarea
          id="kbMarkdown"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={18}
          placeholder={initial ? "" : "Loading… or empty knowledge base."}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">
          {markdown.length.toLocaleString()} characters
        </p>
      </Field>
    </SubSection>
  );
}

function SubSection({
  title,
  hint,
  status,
  errorMsg,
  dirty,
  onSave,
  children,
}: {
  title: string;
  hint?: string;
  status: SaveStatus;
  errorMsg: string | null;
  dirty: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <div className="flex items-center gap-3">
          {status === "saved" ? <span className="text-xs text-emerald-700">Saved</span> : null}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || status === "saving"}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
      {children}
      {status === "error" && errorMsg ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-neutral-700">
        {label}
      </label>
      {children}
    </div>
  );
}

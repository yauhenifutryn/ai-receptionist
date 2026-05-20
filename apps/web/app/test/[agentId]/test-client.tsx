"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";

interface TranscriptEntry {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: number;
}

type Mode = "voice" | "chat";

export default function TestAgentClient({ agentId }: { agentId: string }) {
  return (
    <ConversationProvider>
      <TestAgentInner agentId={agentId} />
    </ConversationProvider>
  );
}

function TestAgentInner({ agentId }: { agentId: string }) {
  const [mode, setMode] = useState<Mode>("voice");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">(
    "unknown",
  );
  const [chatInput, setChatInput] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onConnect: () => {},
    onDisconnect: () => {},
    onMessage: (msg: { source?: string; message?: string }) => {
      const role = msg.source === "user" ? "user" : "agent";
      const text = msg.message ?? "";
      if (!text) return;
      const entry = {
        id: `${Date.now()}-${role}`,
        role: role as "user" | "agent",
        text,
        timestamp: Date.now(),
      };
      setTranscript((t) => [...t, entry]);
      void persistTranscriptTurn(agentId, conversation, entry, mode);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("ElevenLabs error", err);
      setTranscript((t) => [
        ...t,
        {
          id: `${Date.now()}-err`,
          role: "agent",
          text: `[transport error] ${msg.slice(0, 200)}`,
          timestamp: Date.now(),
        },
      ]);
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const conversationId =
    status === "connected" ? safeCall(() => conversation.getId()) : null;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        setMicPermission(result.state as "granted" | "denied");
        result.onchange = () => {
          setMicPermission(result.state as "granted" | "denied");
        };
      })
      .catch(() => {});
  }, []);

  async function requestMic() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  }

  async function startSession() {
    if (mode === "voice" && micPermission !== "granted") await requestMic();
    if (mode === "voice") {
      // Pin to WebSocket. The SDK now defaults to WebRTC (via LiveKit),
      // which requires a server-side conversation token even for public
      // agents in some EL workspaces — produces `NegotiationError: timed
      // out` if a token isn't supplied. WebSocket needs no token for
      // public agents and works out of the box. Switch to WebRTC + token
      // when we deploy to production telephony (Twilio SIP path).
      conversation.startSession({
        agentId,
        connectionType: "websocket",
      });
    } else {
      conversation.startSession({ agentId, textOnly: true });
    }
  }

  function endSession() {
    conversation.endSession();
  }

  async function switchMode(next: Mode) {
    if (next === mode) return;
    if (status === "connected") conversation.endSession();
    setMode(next);
    setChatInput("");
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || status !== "connected") return;
    // The ElevenLabs SDK does NOT echo user-typed chat back via onMessage
    // (it only echoes ASR transcripts in voice mode + agent replies in both
    // modes). So we push the user's message into the transcript ourselves;
    // otherwise the chat bubble UI shows agent-only output, which is what
    // the user reported.
    const entry = {
      id: `${Date.now()}-u`,
      role: "user" as const,
      text,
      timestamp: Date.now(),
    };
    setTranscript((t) => [...t, entry]);
    void persistTranscriptTurn(agentId, conversation, entry, mode);
    conversation.sendUserMessage(text);
    setChatInput("");
  }

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connected":
        return mode === "voice"
          ? isSpeaking
            ? "Agent speaking"
            : "Listening to you"
          : "Connected (chat)";
      case "connecting":
        return "Connecting…";
      default:
        return "Ready";
    }
  }, [status, isSpeaking, mode]);

  const statusColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500 animate-pulse"
        : "bg-neutral-300";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Step 2 of 2
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Talk to the agent</h1>
        <p className="text-neutral-600">
          Test in voice (mic + speakers) or chat (text only). Chat mode is great
          for scripted regression checks; voice mode tests the full Polish TTS
          experience a real caller would hear.
        </p>
      </header>

      <ModeToggle mode={mode} disabled={status === "connecting"} onChange={switchMode} />

      <section className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-neutral-800">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {status === "connected" ? (
              <button
                onClick={endSession}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                {mode === "voice" ? "End call" : "End chat"}
              </button>
            ) : (
              <button
                onClick={startSession}
                disabled={status === "connecting"}
                className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mode === "voice" ? "Start call" : "Start chat"}
                <span aria-hidden>{mode === "voice" ? "●" : "→"}</span>
              </button>
            )}
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Agent ID" value={agentId} mono />
          {mode === "voice" ? (
            <Row label="Microphone" value={micPermissionLabel(micPermission)} />
          ) : (
            <Row label="Mode" value="Text only (no microphone)" />
          )}
          {conversationId ? (
            <Row label="Conversation ID" value={conversationId} mono />
          ) : null}
        </dl>

        {mode === "voice" && micPermission === "denied" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Microphone is blocked. Open browser site settings, allow microphone, then reload.
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Live transcript
          </h2>
          {transcript.length > 0 ? (
            <button
              onClick={() => setTranscript([])}
              className="text-xs text-neutral-500 transition hover:text-neutral-800"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex min-h-[240px] flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          {transcript.length === 0 ? (
            <p className="my-auto text-center text-sm text-neutral-400">
              {mode === "voice"
                ? "Transcript appears here as you talk."
                : "Send your first message below to start."}
            </p>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-start gap-3 text-sm ${
                  entry.role === "user" ? "flex-row-reverse text-right" : ""
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider ${
                    entry.role === "user"
                      ? "bg-neutral-100 text-neutral-700"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {entry.role === "user" ? "You" : "Agent"}
                </span>
                <p
                  className={`max-w-[75%] rounded-2xl px-3 py-2 leading-relaxed ${
                    entry.role === "user"
                      ? "bg-neutral-50 text-neutral-800"
                      : "bg-emerald-50 text-neutral-800"
                  }`}
                >
                  {entry.text}
                </p>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {mode === "chat" ? (
          <form
            onSubmit={handleSendChat}
            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                status === "connected"
                  ? "Napisz wiadomość po polsku…"
                  : "Click Start chat to begin"
              }
              disabled={status !== "connected"}
              className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status !== "connected" || chatInput.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: Mode;
  disabled: boolean;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="inline-flex w-fit items-center rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
      {(["voice", "chat"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            disabled={disabled}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span aria-hidden>{m === "voice" ? "🎙" : "💬"}</span>
            {m === "voice" ? "Voice" : "Chat"}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2 last:border-b-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={`font-medium text-neutral-800 ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function micPermissionLabel(state: "unknown" | "granted" | "denied"): string {
  switch (state) {
    case "granted":
      return "Allowed";
    case "denied":
      return "Blocked";
    default:
      return "Not requested";
  }
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Persist a single transcript turn to the backend so every demo session
 * leaves a durable record on disk under
 * `test-sessions/<agentId>/transcripts/<conversationId>.jsonl`. Best-effort:
 * a failure is logged to console but never blocks the live UX.
 *
 * The conversation id is resolved via `conversation.getId()` which is
 * available only after the SDK reports `connected`. Until then we fall
 * back to a stable "pending" key so very early turns aren't dropped.
 */
async function persistTranscriptTurn(
  agentId: string,
  conversation: { getId?: () => string },
  entry: { role: "user" | "agent"; text: string; timestamp: number },
  mode: "voice" | "chat",
): Promise<void> {
  let conversationId = "pending";
  try {
    const id = conversation.getId?.();
    if (typeof id === "string" && id.length > 0) conversationId = id;
  } catch {
    // SDK not connected yet — use fallback key
  }
  try {
    await fetch("/api/test-transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId,
        conversationId,
        role: entry.role,
        text: entry.text,
        timestamp: entry.timestamp,
        source: mode,
      }),
    });
  } catch (err) {
    console.warn("persistTranscriptTurn failed", err);
  }
}

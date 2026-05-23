"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoStrings } from "@/lib/demo-i18n";

interface TranscriptEntry {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: number;
}

type Mode = "voice" | "chat";

interface Props {
  agentId: string;
  strings: DemoStrings;
  pin: string | null;
}

/**
 * Public-facing voice + chat client used on /demo/<agentId>. Localized via
 * the `strings` prop (PL/EN/RU). Hides operator-only diagnostics (Agent ID,
 * Conversation ID) since prospects don't care about them.
 *
 * Mirror of apps/web/app/test/[agentId]/test-client.tsx but:
 *   • Stripped operator-only fields
 *   • All strings come from props
 *   • Visually focused on the call experience, not debugging
 */
export default function DemoVoiceClient({ agentId, strings, pin }: Props) {
  return (
    <ConversationProvider>
      <Inner agentId={agentId} strings={strings} pin={pin} />
    </ConversationProvider>
  );
}

function Inner({ agentId, strings, pin }: Props) {
  const [mode, setMode] = useState<Mode>("voice");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [chatInput, setChatInput] = useState("");
  // 1s "warming up" window after startSession so the agent's first_message
  // lands before the user feels the urge to speak. See startSession().
  const [warmingUp, setWarmingUp] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onConnect: () => {},
    onDisconnect: () => {
      // Best-effort finalize: ask the backend to fetch the canonical EL record
      // and persist a `conversations` row. PIN-scoped. Failure is non-fatal so
      // it must not block React state cleanup.
      let id: string | undefined;
      try {
        id = conversation.getId?.();
      } catch {
        // SDK not yet connected — nothing to finalize
      }
      if (!id || !pin) return;
      void (async () => {
        try {
          await fetch("/api/conversations/finalize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conversationId: id,
              agentId,
              source: "pin_demo",
              pin,
            }),
          });
        } catch {
          // swallow; the list view can lazy-retry on open
        }
      })();
    },
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
      void persistTurn(agentId, conversation, entry, mode, pin);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("EL error", err);
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
    // Issue 3: clear stale transcript on fresh start so old turns don't
    // visually fluctuate with new ones. Past sessions remain accessible via
    // the "Your sessions" pane below. Also give the agent a brief warmup
    // window so first_message lands before the user feels the urge to speak.
    setTranscript([]);
    setWarmingUp(true);
    if (mode === "voice" && micPermission !== "granted") await requestMic();
    if (mode === "voice") {
      conversation.startSession({
        agentId,
        connectionType: "websocket",
      });
    } else {
      conversation.startSession({ agentId, textOnly: true });
    }
    // 1s cooldown — keeps the UI in "Agent is greeting you…" state so the
    // user waits for the agent's first message instead of fighting it.
    window.setTimeout(() => setWarmingUp(false), 1000);
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
    const entry = {
      id: `${Date.now()}-u`,
      role: "user" as const,
      text,
      timestamp: Date.now(),
    };
    setTranscript((t) => [...t, entry]);
    void persistTurn(agentId, conversation, entry, mode, pin);
    conversation.sendUserMessage(text);
    setChatInput("");
  }

  const statusLabel = useMemo(() => {
    if (warmingUp && status !== "disconnected") {
      // strings.statusConnecting reads like "Łączę…" in PL — fine as the warmup label.
      return strings.statusConnecting;
    }
    switch (status) {
      case "connected":
        return mode === "voice"
          ? isSpeaking
            ? strings.statusSpeaking
            : strings.statusListening
          : strings.statusConnected;
      case "connecting":
        return strings.statusConnecting;
      default:
        return strings.statusReady;
    }
  }, [status, isSpeaking, mode, strings, warmingUp]);

  const statusColor =
    warmingUp || status === "connecting"
      ? "bg-amber-500 animate-pulse"
      : status === "connected"
        ? "bg-emerald-500"
        : "bg-neutral-300";

  return (
    <div className="flex flex-col gap-6">
      <ModeToggle
        mode={mode}
        disabled={status === "connecting"}
        onChange={switchMode}
        strings={strings}
      />

      <section className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-neutral-800">{statusLabel}</span>
          </div>
          {status === "connected" ? (
            <button
              onClick={endSession}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
            >
              {mode === "voice" ? strings.endCall : strings.endChat}
            </button>
          ) : (
            <button
              onClick={startSession}
              disabled={status === "connecting"}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "voice" ? strings.startCall : strings.startChat}
              <span aria-hidden>{mode === "voice" ? "●" : "→"}</span>
            </button>
          )}
        </div>

        {mode === "voice" && micPermission === "denied" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {strings.micBlockedExplain}
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-neutral-500">{strings.privacyNotice}</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            {strings.liveTranscript}
          </h2>
          {transcript.length > 0 ? (
            <button
              onClick={() => setTranscript([])}
              className="text-xs text-neutral-500 transition hover:text-neutral-800"
            >
              {strings.clearTranscript}
            </button>
          ) : null}
        </div>
        <div className="flex min-h-[240px] flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          {transcript.length === 0 ? (
            <p className="my-auto text-center text-sm text-neutral-400">
              {mode === "voice"
                ? strings.transcriptPlaceholderVoice
                : strings.transcriptPlaceholderChat}
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
                  {entry.role === "user" ? strings.speakerYou : strings.speakerAgent}
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
                status === "connected" ? strings.chatInputPlaceholder : strings.chatInputDisabled
              }
              disabled={status !== "connected"}
              className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status !== "connected" || chatInput.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {strings.sendButton}
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
  strings,
}: {
  mode: Mode;
  disabled: boolean;
  onChange: (m: Mode) => void;
  strings: DemoStrings;
}) {
  return (
    <div className="inline-flex w-fit items-center rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
      {(["voice", "chat"] as const).map((m) => {
        const active = mode === m;
        const label = m === "voice" ? strings.modeVoice : strings.modeChat;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            disabled={disabled}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span aria-hidden>{m === "voice" ? "🎙" : "💬"}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

async function persistTurn(
  agentId: string,
  conversation: { getId?: () => string },
  entry: { role: "user" | "agent"; text: string; timestamp: number },
  mode: "voice" | "chat",
  pin: string | null,
): Promise<void> {
  let conversationId = "pending";
  try {
    const id = conversation.getId?.();
    if (typeof id === "string" && id.length > 0) conversationId = id;
  } catch {
    // not connected yet
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
        surface: "pin_demo",
        // PIN is required for pin_demo writes. The demo page already
        // validated this PIN against agents.pin_code before rendering.
        pin,
      }),
    });
  } catch (err) {
    console.warn("persistTurn failed", err);
  }
}

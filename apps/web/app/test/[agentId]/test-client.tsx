"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useState } from "react";

interface TranscriptEntry {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: number;
}

export default function TestAgentClient({ agentId }: { agentId: string }) {
  return (
    <ConversationProvider>
      <TestAgentInner agentId={agentId} />
    </ConversationProvider>
  );
}

function TestAgentInner({ agentId }: { agentId: string }) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">(
    "unknown",
  );

  const conversation = useConversation({
    onConnect: () => {
      // Conversation id is read via getId() once connected.
    },
    onDisconnect: () => {},
    onMessage: (msg: { source?: string; message?: string }) => {
      const role = msg.source === "user" ? "user" : "agent";
      const text = msg.message ?? "";
      if (!text) return;
      setTranscript((t) => [
        ...t,
        {
          id: `${Date.now()}-${t.length}`,
          role,
          text,
          timestamp: Date.now(),
        },
      ]);
    },
    onError: (err: unknown) => {
      console.error("ElevenLabs error", err);
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const conversationId =
    status === "connected" ? safeCall(() => conversation.getId()) : null;

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
      .catch(() => {
        // Permissions API not exposed; we'll request on demand.
      });
  }, []);

  async function requestMic() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  }

  async function startCall() {
    if (micPermission !== "granted") await requestMic();
    conversation.startSession({ agentId });
  }

  function endCall() {
    conversation.endSession();
  }

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connected":
        return isSpeaking ? "Agent speaking" : "Listening to you";
      case "connecting":
        return "Connecting…";
      default:
        return "Ready";
    }
  }, [status, isSpeaking]);

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
          Allow microphone access, click <em>Start call</em>, and have a
          conversation in Polish. The agent will run consent first, then answer
          from its knowledge base and try to book an appointment for you.
        </p>
      </header>

      <section className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-neutral-800">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {status === "connected" ? (
              <button
                onClick={endCall}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                End call
              </button>
            ) : (
              <button
                onClick={startCall}
                disabled={status === "connecting"}
                className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start call
                <span aria-hidden>●</span>
              </button>
            )}
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Agent ID" value={agentId} mono />
          <Row label="Microphone" value={micPermissionLabel(micPermission)} />
          {conversationId ? (
            <Row label="Conversation ID" value={conversationId} mono />
          ) : null}
        </dl>

        {micPermission === "denied" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Microphone is blocked. Open browser site settings, allow microphone,
            then reload.
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
        <div className="flex min-h-[200px] flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          {transcript.length === 0 ? (
            <p className="my-auto text-center text-sm text-neutral-400">
              Transcript appears here as you talk.
            </p>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.id}
                className={`flex gap-3 text-sm ${
                  entry.role === "user" ? "flex-row-reverse text-right" : ""
                }`}
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
                    entry.role === "user"
                      ? "bg-neutral-100 text-neutral-700"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {entry.role === "user" ? "You" : "Agent"}
                </span>
                <p className="max-w-[75%] leading-relaxed text-neutral-800">{entry.text}</p>
              </div>
            ))
          )}
        </div>
      </section>
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

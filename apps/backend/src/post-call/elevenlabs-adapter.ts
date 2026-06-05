/**
 * Adapter: ElevenLabs post-call webhook (snake_case, { type, data } envelope)
 * → internal PostCallWebhook shape (camelCase, strict).
 *
 * Why this exists: /api/post-call fed EL's raw JSON straight into
 * PostCallWebhookSchema (our internal contract), so every REAL webhook 400'd.
 * Nobody noticed for weeks because the workspace post_call_webhook_id was
 * never selected in ConvAI settings — no events ever arrived. Both fixed
 * 2026-06-05; this adapter is the translation layer, unit-tested against a
 * payload captured from a real SIP demo call.
 *
 * Demo-era derived defaults: the consent question is not asked on demo calls
 * (Option B pivot 2026-05-22), so consentDecision=ambiguous/consentFlag=false,
 * which stores the conversation row but NOT the transcript (RODO gate).
 */

interface ElTranscriptTurn {
  role?: unknown;
  message?: unknown;
  time_in_call_secs?: unknown;
}

const SUPPORTED_LANGUAGES = new Set(["pl", "en", "ru"]);

/**
 * Returns the internal-shape payload for an EL `post_call_transcription`
 * event, or null when the body is not one (callers then treat the body as
 * already-internal and validate as before).
 */
export function adaptElevenLabsPostCall(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  const envelope = body as { type?: unknown; data?: unknown };
  if (envelope.type !== "post_call_transcription") return null;
  if (typeof envelope.data !== "object" || envelope.data === null) return null;

  const data = envelope.data as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const phoneCall = (metadata.phone_call ?? null) as Record<string, unknown> | null;

  const startSecs =
    typeof metadata.start_time_unix_secs === "number" ? metadata.start_time_unix_secs : 0;
  const durationSecs =
    typeof metadata.call_duration_secs === "number" ? metadata.call_duration_secs : 0;

  const turnsRaw = Array.isArray(data.transcript) ? (data.transcript as ElTranscriptTurn[]) : [];
  const startsMs = turnsRaw.map((t) =>
    typeof t.time_in_call_secs === "number" && t.time_in_call_secs >= 0
      ? Math.round(t.time_in_call_secs * 1000)
      : 0,
  );
  const transcript = turnsRaw.map((t, i) => ({
    role: t.role === "agent" || t.role === "user" ? t.role : ("system" as const),
    text: typeof t.message === "string" ? t.message : "",
    startMs: startsMs[i] ?? 0,
    // endMs: next turn's start, else this turn's start (EL gives no per-turn end).
    endMs: startsMs[i + 1] ?? startsMs[i] ?? 0,
  }));

  const mainLanguage =
    typeof metadata.main_language === "string" && SUPPORTED_LANGUAGES.has(metadata.main_language)
      ? metadata.main_language
      : "pl";

  // Normalize the caller phone onto the path the handler reads
  // (raw.metadata.phone_call.from_phone_number); EL names it external_number.
  const externalNumber =
    typeof phoneCall?.external_number === "string" ? phoneCall.external_number : null;

  return {
    conversationId: String(data.conversation_id ?? ""),
    agentId: String(data.agent_id ?? ""),
    startedAt: new Date(startSecs * 1000).toISOString(),
    endedAt: new Date((startSecs + durationSecs) * 1000).toISOString(),
    durationSeconds: durationSecs,
    endReason:
      typeof metadata.termination_reason === "string" && metadata.termination_reason
        ? metadata.termination_reason
        : String(data.status ?? "unknown"),
    direction: phoneCall?.direction === "outbound" ? "outbound" : "inbound",
    transcript,
    toolInvocations: [],
    derived: {
      callerLanguage: mainLanguage,
      consentDecision: "ambiguous",
      consentFlag: false,
      escalated: false,
    },
    raw: {
      metadata: {
        ...metadata,
        phone_call: phoneCall ? { ...phoneCall, from_phone_number: externalNumber } : null,
      },
    },
  };
}

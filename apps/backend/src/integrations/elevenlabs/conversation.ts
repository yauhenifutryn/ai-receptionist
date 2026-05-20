/**
 * ElevenLabs GET /v1/convai/conversations/{id} fetch helper.
 *
 * Used by the /api/conversations/finalize route to retrieve the canonical
 * conversation record for browser- and PIN-initiated sessions (PSTN is fed
 * via the post-call webhook and does not need this).
 *
 * Wave 0 probe (2026-05-20) verified the response shape:
 *   - `conversation_id`, `transcript[]`, `metadata{}` at the top level
 *   - tool_calls are nested per-turn at `transcript[i].tool_calls[]`, NOT
 *     as a top-level array
 *   - `metadata.main_language` is the language field
 *   - turn fields are `message` and `time_in_call_secs` (not `text`/`startMs`)
 *
 * The finalize handler is responsible for flattening tool_calls and mapping
 * EL fields into our conversations schema. This helper is transport-only.
 */
export interface ElevenLabsConversationBody {
  conversation_id: string;
  transcript?: unknown[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type FetchConversationResult =
  | { ok: true; body: ElevenLabsConversationBody }
  | { ok: false; status: number | "timeout" | "network"; message: string };

export interface FetchConversationArgs {
  conversationId: string;
  apiKey: string;
  /** Defaults to 5000ms. EL is usually <1s; cap so finalize doesn't hang. */
  timeoutMs?: number;
}

export async function fetchElevenLabsConversation(
  args: FetchConversationArgs,
): Promise<FetchConversationResult> {
  const { conversationId, apiKey, timeoutMs = 5000 } = args;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { "xi-api-key": apiKey }, signal: ac.signal },
    );
    if (!res.ok) {
      return { ok: false, status: res.status, message: `EL responded ${res.status}` };
    }
    const body = (await res.json()) as ElevenLabsConversationBody;
    return { ok: true, body };
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === "AbortError") {
      return { ok: false, status: "timeout", message: "EL fetch timed out" };
    }
    return { ok: false, status: "network", message: err.message || "EL fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

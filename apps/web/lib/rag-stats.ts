/**
 * RAG-retrieval observability helpers.
 *
 * ElevenLabs ConvAI exposes two RAG signals per agent turn in the
 * GET /v1/convai/conversations/{id} payload that we persist verbatim into
 * conversations.raw_jsonb:
 *
 *   - transcript[i].used_static_kb_document_ids: string[] — the KB doc IDs
 *     that actually influenced the agent's reply on this turn. This is the
 *     "did the document do work?" signal.
 *   - transcript[i].rag_retrieval_info: object — the deeper retrieval-pass
 *     metadata (chunks, scores). Shape is not contractually documented, so
 *     we treat it as opaque and only surface presence / chunk-count when
 *     the field exists.
 *
 * Neither field is populated when the agent answered from system prompt
 * alone (small talk, language switching, consent acks). Empty is normal.
 */

export interface RagTurnRef {
  /** Turn index in the transcript (0-based). */
  turnIndex: number;
  /** Agent message text (truncated for UI). */
  preview: string;
  /** time_in_call_secs from EL. */
  timeSec: number | null;
  /** Doc IDs the EL agent attributed this reply to. */
  docIds: string[];
  /** Number of chunks retrieved this turn, if EL surfaced it. null = unknown. */
  chunkCount: number | null;
}

export interface RagConversationStats {
  /** Total agent turns. */
  totalAgentTurns: number;
  /** Agent turns where at least one KB doc was used. */
  turnsWithRetrieval: number;
  /** Per-document usage count for THIS conversation. */
  perDocCounts: Record<string, number>;
  /** Per-turn references, in transcript order. */
  turnRefs: RagTurnRef[];
}

interface OpaqueTurn {
  role?: unknown;
  message?: unknown;
  text?: unknown;
  time_in_call_secs?: unknown;
  used_static_kb_document_ids?: unknown;
  rag_retrieval_info?: unknown;
}

function turnText(t: OpaqueTurn): string {
  if (typeof t.message === "string") return t.message;
  if (typeof t.text === "string") return t.text;
  return "";
}

function turnTime(t: OpaqueTurn): number | null {
  return typeof t.time_in_call_secs === "number" ? t.time_in_call_secs : null;
}

function turnDocIds(t: OpaqueTurn): string[] {
  if (!Array.isArray(t.used_static_kb_document_ids)) return [];
  return t.used_static_kb_document_ids.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
}

function turnChunkCount(t: OpaqueTurn): number | null {
  const info = t.rag_retrieval_info;
  if (!info || typeof info !== "object") return null;
  const obj = info as Record<string, unknown>;
  // Two shapes seen in EL changelog notes: { chunks: [...] } and a top-level
  // count field. Probe both.
  if (Array.isArray(obj.chunks)) return obj.chunks.length;
  if (typeof obj.chunk_count === "number") return obj.chunk_count;
  return null;
}

/**
 * Extract per-conversation RAG stats from a stored EL conversation body.
 * Tolerant: any field missing or malformed yields a zeroed stat rather than
 * throwing — the UI must keep rendering even on partial payloads.
 */
export function extractRagStats(rawJsonb: unknown): RagConversationStats {
  const out: RagConversationStats = {
    totalAgentTurns: 0,
    turnsWithRetrieval: 0,
    perDocCounts: {},
    turnRefs: [],
  };
  if (!rawJsonb || typeof rawJsonb !== "object") return out;
  const transcript = (rawJsonb as { transcript?: unknown }).transcript;
  if (!Array.isArray(transcript)) return out;

  for (let i = 0; i < transcript.length; i++) {
    const t = transcript[i] as OpaqueTurn;
    if (t?.role !== "agent") continue;
    out.totalAgentTurns += 1;

    const docIds = turnDocIds(t);
    if (docIds.length === 0) continue;
    out.turnsWithRetrieval += 1;

    for (const id of docIds) {
      out.perDocCounts[id] = (out.perDocCounts[id] ?? 0) + 1;
    }

    out.turnRefs.push({
      turnIndex: i,
      preview: turnText(t).slice(0, 140),
      timeSec: turnTime(t),
      docIds,
      chunkCount: turnChunkCount(t),
    });
  }
  return out;
}

/**
 * Aggregate per-doc counts across multiple stored EL conversation bodies.
 * Returns a sorted descending list of (docId, count) plus the conversation
 * count that contributed at least one retrieval.
 */
export interface RagAggregate {
  byDoc: Array<{ docId: string; count: number }>;
  totalConversations: number;
  conversationsWithRetrieval: number;
  totalAgentTurns: number;
  turnsWithRetrieval: number;
}

export function aggregateRagStats(rawJsonbs: unknown[]): RagAggregate {
  const counts: Record<string, number> = {};
  let totalAgentTurns = 0;
  let turnsWithRetrieval = 0;
  let conversationsWithRetrieval = 0;

  for (const raw of rawJsonbs) {
    const s = extractRagStats(raw);
    totalAgentTurns += s.totalAgentTurns;
    turnsWithRetrieval += s.turnsWithRetrieval;
    if (s.turnsWithRetrieval > 0) conversationsWithRetrieval += 1;
    for (const [docId, n] of Object.entries(s.perDocCounts)) {
      counts[docId] = (counts[docId] ?? 0) + n;
    }
  }

  const byDoc = Object.entries(counts)
    .map(([docId, count]) => ({ docId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    byDoc,
    totalConversations: rawJsonbs.length,
    conversationsWithRetrieval,
    totalAgentTurns,
    turnsWithRetrieval,
  };
}

/**
 * Resolve a known doc ID against the project's ontology + per-tenant KB sets.
 * Returns a friendly label and the layer it belongs to. Unknown IDs return
 * `null` so the caller can decide whether to show the raw ID.
 */
export type RagDocLayer = "ontology" | "tenant" | "unknown";

export function classifyDocId(
  docId: string,
  ontologyIds: string[],
  tenantIds: string[] = [],
): RagDocLayer {
  if (ontologyIds.includes(docId)) return "ontology";
  if (tenantIds.includes(docId)) return "tenant";
  return "unknown";
}

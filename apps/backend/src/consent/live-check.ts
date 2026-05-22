/**
 * DEPRECATED 2026-05-22 (Option B consent pivot).
 *
 * This was the tool-layer consent gate for create_booking. Dropped on
 * 2026-05-22 in favor of the website-notice + legitimate-interest model
 * documented in docs/plans/2026-05-22-option-b-consent-pivot.md.
 *
 * File RETAINED for potential reuse if a hospital partner or larger pilot
 * later requires the strict gate. The classifier and EL transcript fetcher
 * are useful infra; bringing the gate back is a small re-wire in
 * apps/web/lib/booking-deps.ts + a re-export.
 *
 * Live consent gate — server-side enforcement for create_booking.
 *
 * Why this exists: consent was prompt-only. The system prompt instructs the
 * agent to ask the consent question and only proceed after a "yes". But a
 * misbehaving LLM, prompt injection, or accidental prompt edit could lead to
 * a booking being persisted without RODO-compliant consent. That's not a risk
 * we can carry on a healthcare-adjacent product.
 *
 * Architecture: at the moment create_booking is invoked, we read the live EL
 * conversation transcript by conversationId, scan user turns AFTER the
 * consent question's agent turn, and return "yes" / "no" / "unknown".
 * create_booking refuses with ServerToolError code "consent_required" when
 * the answer isn't "yes".
 *
 * Reads, not LLM: substring match against AFFIRMATIVE_EXAMPLES /
 * NEGATIVE_EXAMPLES tokens. Reasons we don't use the LLM classifier here:
 *   - Deterministic, no extra latency
 *   - No external dependency in the booking hot-path
 *   - The consent question is fixed wording; a heuristic is sufficient
 *
 * The post-call webhook still runs the LLM classifier on the full transcript
 * for the conversations.consent_flag column and the consent_log row — that's
 * the audit-grade record. This live check is the booking gate.
 */

import {
  AFFIRMATIVE_EXAMPLES,
  CONSENT_QUESTION,
  NEGATIVE_EXAMPLES,
  type ConsentLanguage,
} from "./script.js";

export type LiveConsentStatus = "yes" | "no" | "unknown";

export interface LiveConsentCheckerOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

interface ElTurn {
  role?: "agent" | "user" | string;
  message?: string;
  text?: string;
  time_in_call_secs?: number;
}

interface ElConversationBody {
  transcript?: ElTurn[];
}

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

/**
 * Construct a checker bound to an EL API key. Returns a function that
 * resolves to "yes" / "no" / "unknown" for a given conversation.
 *
 * Fail-closed: any error (EL down, transcript missing, network blip) returns
 * "unknown", which the booking handler treats as a refusal. RODO over UX:
 * better a temporary "łączę z recepcją" than a booking-without-consent.
 */
export function createLiveConsentChecker(
  opts: LiveConsentCheckerOptions,
): (conversationId: string) => Promise<LiveConsentStatus> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = opts.fetcher ?? fetch;
  return async (conversationId: string): Promise<LiveConsentStatus> => {
    try {
      const res = await doFetch(
        `${baseUrl}/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
        {
          headers: { "xi-api-key": opts.apiKey },
        },
      );
      if (!res.ok) return "unknown";
      const body = (await res.json()) as ElConversationBody;
      return classifyTranscript(body.transcript ?? []);
    } catch {
      return "unknown";
    }
  };
}

/**
 * Pure, dependency-free classifier. Exported so tests can drive it directly
 * without a fake fetch.
 *
 * Algorithm:
 *   1. Find the agent turn that contains the consent question (any of PL/EN/RU).
 *      Match by a short fingerprint of each question's wording so paraphrases
 *      still resolve.
 *   2. Take the FIRST user turn after that index.
 *   3. Match the user's message against affirmative + negative example sets.
 *      Substring match (case-insensitive, accent-stripped where useful).
 *   4. Affirmative + no negative → "yes". Negative + no affirmative → "no".
 *      Anything else (no match, both, silence) → "unknown" (fail-closed).
 *   5. If no consent question turn is found, return "unknown".
 */
export function classifyTranscript(transcript: ElTurn[]): LiveConsentStatus {
  if (transcript.length === 0) return "unknown";

  const consentTurnIndex = findConsentQuestionTurn(transcript);
  if (consentTurnIndex < 0) return "unknown";

  const reply = findFirstUserTurnAfter(transcript, consentTurnIndex);
  if (!reply) return "unknown";

  return classifyReply(reply);
}

function turnText(t: ElTurn): string {
  return (t.message ?? t.text ?? "").toString();
}

/**
 * Fingerprints of the canonical consent questions across PL/EN/RU. A 25-char
 * substring is unique enough to ID the turn without being so long that it
 * misses paraphrased variants (the agent sometimes reformulates slightly,
 * e.g. moving the recording-disclaimer clause around).
 */
const QUESTION_FINGERPRINTS = (Object.keys(CONSENT_QUESTION) as ConsentLanguage[]).map(
  (lang) => CONSENT_QUESTION[lang].slice(0, 25).toLowerCase(),
);

function findConsentQuestionTurn(transcript: ElTurn[]): number {
  for (let i = 0; i < transcript.length; i++) {
    const t = transcript[i]!;
    if (t.role !== "agent") continue;
    const msg = turnText(t).toLowerCase();
    if (!msg) continue;
    for (const fp of QUESTION_FINGERPRINTS) {
      if (msg.includes(fp)) return i;
    }
    // Also catch the "zapis tej rozmowy / consent to a transcript / запис..."
    // structural fragments, in case the agent shortened the question.
    if (
      msg.includes("zapis tej rozmowy") ||
      msg.includes("zachowanie zapisu") ||
      msg.includes("transcript of this call being kept") ||
      msg.includes("сохранение записи этого разговора")
    ) {
      return i;
    }
  }
  return -1;
}

function findFirstUserTurnAfter(transcript: ElTurn[], startIndex: number): string | null {
  for (let i = startIndex + 1; i < transcript.length; i++) {
    const t = transcript[i]!;
    if (t.role === "user") {
      const txt = turnText(t).trim();
      if (txt.length > 0) return txt;
    }
  }
  return null;
}

function classifyReply(reply: string): LiveConsentStatus {
  const normalized = reply.toLowerCase().trim();
  // Strip punctuation so "tak." and "tak!" both match.
  const stripped = normalized.replace(/[.,!?…]/g, "").trim();

  const allAffirmative = (Object.keys(AFFIRMATIVE_EXAMPLES) as ConsentLanguage[]).flatMap(
    (lang) => AFFIRMATIVE_EXAMPLES[lang].map((s) => s.toLowerCase()),
  );
  const allNegative = (Object.keys(NEGATIVE_EXAMPLES) as ConsentLanguage[]).flatMap(
    (lang) => NEGATIVE_EXAMPLES[lang].map((s) => s.toLowerCase()),
  );

  const hasAffirmative = allAffirmative.some(
    (token) => stripped === token || stripped.startsWith(token + " ") || stripped.includes(" " + token + " ") || stripped.endsWith(" " + token),
  );
  const hasNegative = allNegative.some(
    (token) => stripped === token || stripped.startsWith(token + " ") || stripped.includes(" " + token + " ") || stripped.endsWith(" " + token),
  );

  // "Tak, oczywiście" → affirmative wins. "Nie, dziękuję" → negative.
  // Both somehow present → unknown (fail-closed). Neither → unknown.
  if (hasAffirmative && !hasNegative) return "yes";
  if (hasNegative && !hasAffirmative) return "no";
  return "unknown";
}

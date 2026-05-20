import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostCallRepository } from "../post-call/repository.js";
import type { FetchConversationResult } from "../integrations/elevenlabs/conversation.js";
import { handleFinalizeConversation } from "./finalize-handler.js";

/**
 * Best-effort hydration of conversations rows for sessions that streamed
 * turns to test_transcripts but never reached /api/conversations/finalize
 * (browser closed before disconnect handler fired, network blip on the
 * final POST, etc.).
 *
 * Invoked from the list route when the audience is operator or owner.
 * Skipped for the prospect PIN path to avoid letting unauth callers
 * trigger EL fetches at scale.
 *
 * Strategy:
 *   1. Read up to `sampleLimit` distinct conversation_id values from
 *      test_transcripts for the agent (newest first).
 *   2. Diff against the rows we already have.
 *   3. For up to `cap` missing ids, look up the surface (browser_test
 *      vs pin_demo) and call handleFinalizeConversation with
 *      bypassAuthCheck=true (we're trusted server-side here).
 *   4. Errors are swallowed per item — retry happens on the next list
 *      view.
 *
 * Returns the number of finalize attempts made so the caller can decide
 * whether to re-query the list to surface the new rows.
 */
export interface LazyFinalizeArgs {
  providerAgentId: string;
  /** Rows already returned by the list handler, used to skip work. */
  knownConversationIds: Set<string>;
  service: SupabaseClient;
  apiKey: string;
  fetchEl: (args: { conversationId: string }) => Promise<FetchConversationResult>;
  repo: PostCallRepository;
  cap?: number;
  sampleLimit?: number;
}

export async function lazyFinalizeMissing(args: LazyFinalizeArgs): Promise<number> {
  const cap = args.cap ?? 10;
  const sampleLimit = args.sampleLimit ?? 200;

  const { data, error } = await args.service
    .from("test_transcripts")
    .select("conversation_id, surface")
    .eq("provider_agent_id", args.providerAgentId)
    .order("recorded_at", { ascending: false })
    .limit(sampleLimit);
  if (error) return 0;

  const seen = new Set<string>();
  const missing: Array<{ conversationId: string; source: "browser_test" | "pin_demo" }> = [];
  for (const row of (data ?? []) as Array<{ conversation_id: string; surface: string | null }>) {
    if (!row.conversation_id || row.conversation_id === "pending") continue;
    if (args.knownConversationIds.has(row.conversation_id)) continue;
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);
    const surface: "browser_test" | "pin_demo" =
      row.surface === "pin_demo" ? "pin_demo" : "browser_test";
    missing.push({ conversationId: row.conversation_id, source: surface });
    if (missing.length >= cap) break;
  }
  if (missing.length === 0) return 0;

  await Promise.all(
    missing.map(async (m) => {
      try {
        await handleFinalizeConversation(
          {
            conversationId: m.conversationId,
            agentId: args.providerAgentId,
            source: m.source,
            // pin field unused when bypassAuthCheck=true; pass a placeholder
            // so the zod refinement on FinalizeConversationRequestSchema
            // doesn't fail for source=pin_demo.
            ...(m.source === "pin_demo" ? { pin: "lazy-retry" } : {}),
          },
          {
            isOperator: true,
            pinMatchAgentId: null,
            bypassAuthCheck: true,
            fetchEl: args.fetchEl,
            repo: args.repo,
          },
        );
      } catch {
        // Swallow per-item: the next list view will retry.
      }
    }),
  );

  return missing.length;
}

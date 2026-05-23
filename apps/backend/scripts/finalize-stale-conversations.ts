// One-off: walk test_transcripts for an agent, find conversation_ids without
// a matching conversations row, fetch from EL, upsert via service-role.
// Use this when the lazy-retry on /api/conversations hasn't fired yet.
//
// Usage:
//   set -a; . apps/web/.env.local; set +a
//   pnpm -F backend tsx scripts/finalize-stale-conversations.ts <provider_agent_id>

import { createClient } from "@supabase/supabase-js";
import { fetchElevenLabsConversation } from "../src/integrations/elevenlabs/conversation.js";

async function main() {
  const providerAgentId = process.argv[2];
  if (!providerAgentId) {
    console.error("usage: finalize-stale-conversations.ts <provider_agent_id>");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const elKey = process.env.ELEVENLABS_API_KEY!;
  if (!url || !key || !elKey) throw new Error("env missing");
  const sb = createClient(url, key);

  const { data: agentRow } = await sb
    .from("agents")
    .select("id, tenant_id")
    .eq("provider_agent_id", providerAgentId)
    .maybeSingle();
  if (!agentRow) throw new Error("agent not found");

  const { data: tt } = await sb
    .from("test_transcripts")
    .select("conversation_id")
    .eq("provider_agent_id", providerAgentId)
    .order("recorded_at", { ascending: false })
    .limit(500);

  const { data: cv } = await sb
    .from("conversations")
    .select("conversation_id")
    .eq("provider_agent_id", providerAgentId);
  const known = new Set((cv ?? []).map((r) => r.conversation_id));

  const distinct = new Set<string>();
  for (const r of tt ?? []) {
    if (r.conversation_id && r.conversation_id !== "pending") distinct.add(r.conversation_id);
  }
  const missing = [...distinct].filter((id) => !known.has(id));
  console.log(
    `agent=${providerAgentId} test_transcripts=${tt?.length ?? 0} conversations=${cv?.length ?? 0} missing=${missing.length}`,
  );

  for (const cid of missing) {
    const el = await fetchElevenLabsConversation({ conversationId: cid, apiKey: elKey });
    if (!el.ok) {
      console.log(`  ${cid} EL fetch failed: ${el.status} ${el.message}`);
      continue;
    }
    const body = el.body;
    const meta = (body.metadata ?? {}) as Record<string, unknown>;
    const startUnix =
      typeof meta.start_time_unix_secs === "number" ? meta.start_time_unix_secs : null;
    const durationSecs =
      typeof meta.call_duration_secs === "number" ? meta.call_duration_secs : null;
    const startedAt = startUnix
      ? new Date(startUnix * 1000).toISOString()
      : new Date().toISOString();
    const endedAt =
      startUnix && durationSecs ? new Date((startUnix + durationSecs) * 1000).toISOString() : null;
    type ElTurn = { tool_calls?: unknown[]; tool_results?: Array<{ is_error?: boolean }> };
    const turns: ElTurn[] = Array.isArray(body.transcript) ? (body.transcript as ElTurn[]) : [];
    const flatTools = turns.flatMap((t) => (Array.isArray(t.tool_calls) ? t.tool_calls : []));
    const flatResults = turns.flatMap((t) => (Array.isArray(t.tool_results) ? t.tool_results : []));
    const toolErrorCount = flatResults.filter((r) => r && r.is_error === true).length;
    const language =
      (meta.main_language as string | undefined) ?? (meta.language as string | undefined) ?? null;

    const { error } = await sb.from("conversations").upsert(
      {
        conversation_id: cid,
        tenant_id: agentRow.tenant_id,
        agent_id: agentRow.id,
        provider_agent_id: providerAgentId,
        source: "pin_demo",
        direction: null,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSecs,
        end_reason: (meta.termination_reason as string | undefined) ?? null,
        consent_flag: null,
        caller_language: language,
        escalated: false,
        tool_call_count: flatTools.length,
        tool_error_count: toolErrorCount,
        raw_jsonb: { ...body, toolInvocations: flatTools },
        finalized_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    );
    if (error) console.log(`  ${cid} insert failed: ${error.message}`);
    else console.log(`  ${cid} ok turns=${turns.length} dur=${durationSecs}s lang=${language}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

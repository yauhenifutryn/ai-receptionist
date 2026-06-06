#!/usr/bin/env tsx
/**
 * Backfill the 2026-06-06 retrieval-variance RAG settings onto live agents:
 * num_candidates (ANN recall) + per-tenant query_rewrite_prompt_override
 * (clinic name pinned into every retrieval query). Read-modify-write: all
 * other rag fields are preserved. New agents get these at provisioning.
 *
 * Run:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/backfill-rag-config.ts [agent_id ...]
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildQueryRewritePrompt,
  RAG_NUM_CANDIDATES,
} from "../src/orchestration/elevenlabs-convai.js";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env missing: ${k}`);
  return v;
};

const apiKey = env("ELEVENLABS_API_KEY");
const supabase = createClient(
  process.env.SUPABASE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: agents, error } = await supabase
  .from("agents")
  .select("provider_agent_id, tenant:tenants(display_name)")
  .eq("provider", "elevenlabs");
if (error) throw new Error(`Supabase listAgents: ${error.message}`);

let rows = (agents ?? []) as Array<{
  provider_agent_id: string;
  tenant: { display_name: string } | null;
}>;
const only = process.argv.slice(2).filter((a) => a.startsWith("agent_"));
if (only.length > 0) rows = rows.filter((r) => only.includes(r.provider_agent_id));

let ok = 0;
let fail = 0;
for (const row of rows) {
  const id = row.provider_agent_id;
  if (!row.tenant) {
    console.error(`${id}: skip (no tenant row)`);
    continue;
  }
  const a = (await (
    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`, {
      headers: { "xi-api-key": apiKey },
    })
  ).json()) as { conversation_config?: { agent?: { prompt?: { rag?: Record<string, unknown> } } } };
  const rag = a.conversation_config?.agent?.prompt?.rag;
  if (!rag) {
    console.error(`${id}: skip (no rag config)`);
    fail++;
    continue;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            rag: {
              ...rag,
              num_candidates: RAG_NUM_CANDIDATES,
              query_rewrite_prompt_override: buildQueryRewritePrompt(row.tenant.display_name),
            },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    console.error(`${id} (${row.tenant.display_name}): FAIL ${res.status}`);
    fail++;
    continue;
  }
  console.log(`${id} (${row.tenant.display_name}): ok`);
  ok++;
}
console.log(`\nDone. ok=${ok} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env tsx
/**
 * Backfill existing ConvAI agents with the new defaults from
 * `elevenlabs-convai.ts`:
 *
 *   - tts.model_id = "eleven_v3_conversational" + expressive_mode + suggested_audio_tags
 *   - platform_settings.analysis_llm + evaluation.criteria + data_collection
 *   - coaching_settings = { type: "coached", memory_base_id: <agent_id> }
 *   - knowledge_base re-merged to keep existing per-tenant docs AND attach
 *     the shared ontology doc IDs from env
 *
 * Idempotent: PATCH-only, safe to re-run. Reads existing config first so the
 * tenant's per-clinic KB docs stay attached; the script only ADDS ontology
 * docs that are missing.
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *
 *   # All agents:
 *   pnpm tsx apps/backend/scripts/backfill-agent-config.ts
 *
 *   # Specific agents (space-separated EL agent_id values):
 *   pnpm tsx apps/backend/scripts/backfill-agent-config.ts agent_3101krxkms... agent_xxx...
 */

import {
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_AUDIO_TAGS,
  DEFAULT_ANALYSIS_LLM,
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_DATA_COLLECTION,
  readOntologyDocIds,
} from "../src/orchestration/elevenlabs-convai.js";
import { createClient } from "@supabase/supabase-js";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY missing");
  process.exit(1);
}

const targetAgentIds = process.argv.slice(2);

async function listAllAgentIds(): Promise<string[]> {
  if (targetAgentIds.length > 0) return targetAgentIds;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Provide explicit agent ids on argv, OR set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enumerate from Supabase.",
    );
  }
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb
    .from("agents")
    .select("provider_agent_id, status")
    .eq("provider", "elevenlabs");
  if (error) throw new Error(`Supabase listAgents: ${error.message}`);
  return (data ?? [])
    .map((row) => (row as { provider_agent_id: string }).provider_agent_id)
    .filter(Boolean);
}

interface KnowledgeEntry {
  type: string;
  id?: string;
  name?: string;
  usage_mode?: string;
}

interface AgentResponse {
  agent_id: string;
  conversation_config?: {
    agent?: {
      prompt?: {
        knowledge_base?: KnowledgeEntry[];
      };
    };
    tts?: {
      model_id?: string;
      expressive_mode?: boolean;
      suggested_audio_tags?: string[];
    };
  };
}

async function getAgent(agentId: string): Promise<AgentResponse> {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { "xi-api-key": apiKey! },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${agentId}: ${res.status} ${body}`);
  }
  return (await res.json()) as AgentResponse;
}

async function patchAgent(agentId: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": apiKey!,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`PATCH ${agentId}: ${res.status} ${errBody}`);
  }
}

const ONTOLOGY_DOC_NAMES = [
  "ontology/services.md",
  "ontology/triage.md",
  "ontology/scripts.md",
  "ontology/emergency-keywords.md",
  "ontology/consent.md",
];

const ontologyIds = readOntologyDocIds();
if (ontologyIds.length === 0) {
  console.error(
    "WARNING: ELEVENLABS_ONTOLOGY_KB_DOC_IDS not set — ontology won't be attached.",
  );
} else {
  console.error(`Ontology docs: ${ontologyIds.length} ids loaded from env.`);
}

const agentIds = await listAllAgentIds();
console.error(`Backfilling ${agentIds.length} agent(s)...`);

let okCount = 0;
let failCount = 0;
for (const agentId of agentIds) {
  try {
    console.error(`\n${agentId}`);
    const existing = await getAgent(agentId);

    // 1. Build the merged knowledge_base: keep all existing entries whose id
    //    is NOT in the ontology id set, then re-append the canonical ontology
    //    entries. Filters out any stale ontology docs (e.g. from a previous
    //    upload that's since been re-uploaded with a new id).
    const ontologySet = new Set(ontologyIds);
    const existingKb = existing.conversation_config?.agent?.prompt?.knowledge_base ?? [];
    const tenantKb = existingKb.filter(
      (e) => !!e.id && !ontologySet.has(e.id),
    );
    const ontologyEntries = ontologyIds.map((id, i) => ({
      type: "text" as const,
      id,
      name: ONTOLOGY_DOC_NAMES[i] ?? `ontology-${i}`,
      usage_mode: "auto" as const,
    }));
    const mergedKb = [...tenantKb, ...ontologyEntries];

    // 2. Single PATCH with everything except coaching (coaching needs the
    //    agent_id which we already know — emit it in the same call).
    const patchBody: Record<string, unknown> = {
      conversation_config: {
        agent: {
          prompt: { knowledge_base: mergedKb },
        },
        tts: {
          model_id: DEFAULT_TTS_MODEL_ID,
          expressive_mode: true,
          suggested_audio_tags: [...DEFAULT_AUDIO_TAGS],
        },
      },
      platform_settings: {
        analysis_llm: DEFAULT_ANALYSIS_LLM,
        evaluation: { criteria: [...DEFAULT_EVALUATION_CRITERIA] },
        data_collection: DEFAULT_DATA_COLLECTION,
      },
      coaching_settings: {
        type: "coached",
        memory_base_id: agentId,
      },
    };

    await patchAgent(agentId, patchBody);
    console.error(
      `  ok: tts=v3, ontology=${ontologyEntries.length}, tenant_kb_kept=${tenantKb.length}, evaluation_criteria=${DEFAULT_EVALUATION_CRITERIA.length}, coaching=on`,
    );
    okCount++;
  } catch (e) {
    console.error(`  FAIL: ${(e as Error).message}`);
    failCount++;
  }
}

console.error(`\nDone. ok=${okCount} fail=${failCount}`);
process.exit(failCount > 0 ? 1 : 0);

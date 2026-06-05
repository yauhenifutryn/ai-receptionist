#!/usr/bin/env tsx
/**
 * One-shot: rebuild buildSystemPrompt() for every live agent and PATCH it
 * into the agent's conversation_config.agent.prompt.prompt field on EL.
 *
 * Why this exists: the system prompt is baked at provision time. Backfill
 * (apps/backend/scripts/backfill-agent-config.ts) updates tts + knowledge
 * but deliberately does NOT touch the prompt, because that's a per-tenant
 * computation (tenantDisplayName drives the wording). This script fills
 * that gap for one-off prompt rewrites — e.g. after sharpening the
 * language-mirror rule.
 *
 * Run:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm tsx apps/backend/scripts/push-system-prompt.ts
 */

import {
  buildSystemPrompt,
  clinicFactsFromKnowledgeMarkdown,
  extractPolishCity,
} from "../src/prompts/system-prompt.js";
import { buildOpeningMessage } from "../src/orchestration/elevenlabs-convai.js";
import { createClient } from "@supabase/supabase-js";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY missing");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: agents, error } = await sb
  .from("agents")
  .select("provider_agent_id, status, tenant:tenants(display_name, source_url)")
  .eq("provider", "elevenlabs");

if (error) throw new Error(`Supabase listAgents: ${error.message}`);

const rows = (agents ?? []) as Array<{
  provider_agent_id: string;
  status: string;
  tenant: { display_name: string; source_url: string | null } | null;
}>;

console.error(`Pushing fresh system prompt to ${rows.length} agent(s)...\n`);

let ok = 0;
let fail = 0;

for (const row of rows) {
  const agentId = row.provider_agent_id;
  const tenant = row.tenant;
  if (!tenant) {
    console.error(`${agentId}: skip (no tenant row)`);
    fail++;
    continue;
  }

  // Core clinic facts (hours/address/phone) + city: parsed from the agent's
  // own clinic KB document on EL (the scraper output is long gone, but the
  // uploaded knowledge.md carries the same lines). 2026-06-06: facts are
  // baked into the prompt so RAG retrieval variance can never lose them.
  let clinicFacts = {};
  let detectedCity: string | null = null;
  try {
    const agentRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      headers: { "xi-api-key": apiKey },
    });
    const agentCfg = (await agentRes.json()) as {
      conversation_config?: {
        agent?: { prompt?: { knowledge_base?: Array<{ id: string; name: string }> } };
      };
    };
    const docs = agentCfg.conversation_config?.agent?.prompt?.knowledge_base ?? [];
    const clinicDoc = docs.find((d) => !d.name.startsWith("ontology"));
    if (clinicDoc) {
      const content = await (
        await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${clinicDoc.id}/content`, {
          headers: { "xi-api-key": apiKey },
        })
      ).text();
      clinicFacts = clinicFactsFromKnowledgeMarkdown(content);
      const address = (clinicFacts as { address?: string }).address;
      detectedCity = extractPolishCity(address);
    }
  } catch (e) {
    console.error(`  WARN: clinic-facts parse failed: ${(e as Error).message}`);
  }
  const systemPrompt = buildSystemPrompt({
    tenantDisplayName: tenant.display_name,
    ...(detectedCity ? { city: detectedCity } : {}),
    ...(Object.keys(clinicFacts).length ? { clinicFacts } : {}),
  });
  const firstMessage = buildOpeningMessage(tenant.display_name);

  console.error(`${agentId} (${tenant.display_name})`);
  console.error(
    `  prompt: ${systemPrompt.length} chars · first_message: ${firstMessage.length} chars`,
  );

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          // Push the opening turn AND the interrupt guard at the same time.
          // Both are per-tenant strings tied to the prompt — keeping them in
          // one PATCH guarantees they stay in sync across rollouts. Guard is
          // false post Option B pivot (caller can interrupt the opener).
          first_message: firstMessage,
          disable_first_message_interruptions: false,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  FAIL ${res.status}: ${body.slice(0, 300)}`);
    fail++;
    continue;
  }
  console.error(`  ok`);
  ok++;
}

console.error(`\nDone. ok=${ok} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env tsx
/**
 * One-shot: PATCH the canonical consent-gate workflow onto every live agent.
 *
 * Why this exists: workflows are stored on the agent (conversation_config.workflow)
 * and EL accepts the full JSON via the same PATCH endpoint we already use for
 * system prompts + TTS + tools. Same pattern as push-system-prompt.ts.
 *
 * Run:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm tsx apps/backend/scripts/push-consent-workflow.ts
 *
 * Flags:
 *   --dry-run           Print the PATCH body for the first agent and exit.
 *   --only <agent_id>   PATCH only the named agent (useful for testing).
 */

import { CONSENT_GATE_WORKFLOW } from "../src/orchestration/elevenlabs-workflow.js";
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const onlyAgentId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let query = sb.from("agents").select("provider_agent_id, status, tenant:tenants(display_name)").eq("provider", "elevenlabs");
if (onlyAgentId) query = query.eq("provider_agent_id", onlyAgentId);

const { data: agents, error } = await query;
if (error) throw new Error(`Supabase listAgents: ${error.message}`);

const rows = (agents ?? []) as Array<{
  provider_agent_id: string;
  status: string;
  tenant: { display_name: string } | null;
}>;

// Workflow lives at the TOP of the agent payload (not under
// conversation_config). EL's docs example places it inside
// conversation_config, but a round-trip PATCH+GET against a live agent
// proved EL silently drops it from that path. Top-level it is.
const PATCH_BODY = { workflow: CONSENT_GATE_WORKFLOW };

if (dryRun) {
  console.error("--- DRY RUN ---");
  console.error(`Would PATCH ${rows.length} agent(s) with this workflow:\n`);
  console.error(JSON.stringify(PATCH_BODY, null, 2));
  process.exit(0);
}

console.error(`Pushing consent-gate workflow to ${rows.length} agent(s)...\n`);

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

  console.error(`${agentId} (${tenant.display_name})`);

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(PATCH_BODY),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  FAIL ${res.status}: ${body.slice(0, 600)}`);
    fail++;
    continue;
  }
  const responseBody = (await res.json()) as {
    workflow?: { nodes?: Record<string, unknown> };
  };
  const nodeCount = Object.keys(responseBody.workflow?.nodes ?? {}).length;
  const edgeCount = Object.keys((responseBody.workflow as { edges?: Record<string, unknown> })?.edges ?? {}).length;
  console.error(`  ok: workflow nodes=${nodeCount} edges=${edgeCount}`);
  if (nodeCount < Object.keys(CONSENT_GATE_WORKFLOW.nodes).length) {
    console.error(`  WARN: expected ${Object.keys(CONSENT_GATE_WORKFLOW.nodes).length} nodes; EL may have rejected the schema silently. Verify with GET.`);
  }
  ok++;
}

console.error(`\nDone. ok=${ok} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);

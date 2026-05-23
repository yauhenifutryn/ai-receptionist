/**
 * One-off backfill: walk every row in the `agents` table and re-attach the
 * workspace-catalog booking tools (check_availability, create_booking) via
 * PATCH /v1/convai/agents/{id}.
 *
 * Background: agents provisioned before Chat C had inline `prompt.tools` that
 * EL silently dropped. This script idempotently:
 *   1. Ensures both tools exist in the workspace catalog (creates on demand).
 *   2. PATCHes each agent with the workspace tool_ids.
 *
 * Idempotent: re-running produces the same end state (no new tools created
 * on subsequent runs; PATCH overwrites with the same ids).
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm -F @ai-receptionist/backend tsx scripts/backfill-agent-tools.ts \
 *     [--server-tool-base-url https://app.example.com/api]
 *
 * If --server-tool-base-url is not provided, falls back to env
 * SERVER_TOOL_BASE_URL, then to https://ai-receptionist.vercel.app/api.
 */

import { createClient } from "@supabase/supabase-js";
import { ElevenLabsConvAIProvider } from "../src/orchestration/elevenlabs-convai.js";

interface AgentRow {
  id: string;
  tenant_id: string;
  provider_agent_id: string | null;
}

function parseArg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!supabaseUrl || !serviceRoleKey || !elKey) {
    console.error(
      "[backfill] env missing — need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY",
    );
    process.exit(2);
  }

  const serverToolBaseUrl =
    parseArg("server-tool-base-url") ??
    process.env.SERVER_TOOL_BASE_URL ??
    "https://ai-receptionist.vercel.app/api";

  console.log(`[backfill] serverToolBaseUrl=${serverToolBaseUrl}`);

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb
    .from("agents")
    .select("id, tenant_id, provider_agent_id")
    .order("id", { ascending: true });
  if (error) {
    console.error(`[backfill] supabase select failed: ${error.message}`);
    process.exit(1);
  }
  const rows = (data ?? []) as AgentRow[];
  console.log(`[backfill] found ${rows.length} agent row(s)`);

  const provider = new ElevenLabsConvAIProvider({ apiKey: elKey });
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.provider_agent_id) {
      console.log(
        `[backfill] agent row=${row.id} tenant=${row.tenant_id} skip (no provider_agent_id)`,
      );
      skipped += 1;
      continue;
    }
    const started = Date.now();
    try {
      await provider.updateAgentTools({
        agentId: row.provider_agent_id,
        serverToolBaseUrl,
      });
      const ms = Date.now() - started;
      console.log(`[backfill] agent=${row.provider_agent_id} tenant=${row.tenant_id} ok (${ms}ms)`);
      ok += 1;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(
        `[backfill] agent=${row.provider_agent_id} tenant=${row.tenant_id} FAIL: ${msg}`,
      );
      failed += 1;
    }
  }
  console.log(
    `[backfill] done — ok=${ok} skipped=${skipped} failed=${failed} total=${rows.length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[backfill] crashed:", e);
  process.exit(1);
});

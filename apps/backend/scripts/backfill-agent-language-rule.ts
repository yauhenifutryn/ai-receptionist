/**
 * One-off backfill: inject the "translate KB content into the caller's language"
 * rule into every existing agent's system prompt via PATCH /v1/convai/agents/{id}.
 *
 * Background: the knowledge base stores service names + prices in Polish. Older
 * agents quoted them verbatim inside non-Polish replies (e.g. a Polish price
 * sentence inside an otherwise-Russian answer). The fix is already in
 * src/prompts/system-prompt.ts for all FUTURE provisions; this script applies
 * the same rule to agents that were provisioned before the fix.
 *
 * Idempotent: agents that already contain the rule are skipped. The PATCH sends
 * back the FULL prompt object (preserving tool_ids, knowledge_base, llm, etc.),
 * so tools/KB are not dropped.
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm -F @ai-receptionist/backend tsx scripts/backfill-agent-language-rule.ts
 */

import { createClient } from "@supabase/supabase-js";

const EL_BASE = "https://api.elevenlabs.io";

const RULE =
  "\n\nTRANSLATE knowledge-base content into the caller's language. The knowledge base stores " +
  "service names and prices in Polish (e.g. 'Konsultacja stomatologiczna'). Those Polish strings are for " +
  "LOOKUP/matching ONLY — never speak them verbatim inside a non-Polish reply. When you quote a price or " +
  "service to a Russian or English caller, render the ENTIRE sentence — service name AND amount — in their " +
  "language. The currency word 'złoty' may stay (it is the local currency), but every other word is translated. " +
  "Example: KB entry 'Konsultacja stomatologiczna — 100 zł'. To a Russian caller say " +
  "'Стоматологическая " +
  "консультация стоит " +
  "сто злотых', NOT 'Konsultacja stomatologiczna kosztuje sto złotych'. " +
  "To an English caller: 'A dental consultation costs one hundred złoty'. A reply that pastes Polish " +
  "knowledge-base text into a Russian or English sentence is a HARD ERROR.";

const MARKER = "TRANSLATE knowledge-base content into the caller's language";

interface AgentRow {
  id: string;
  tenant_id: string;
  provider_agent_id: string | null;
}

async function elGet(id: string, key: string): Promise<any> {
  const r = await fetch(`${EL_BASE}/v1/convai/agents/${id}`, {
    headers: { "xi-api-key": key },
  });
  if (!r.ok) throw new Error(`GET ${id} -> HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function elPatch(id: string, key: string, body: unknown): Promise<void> {
  const r = await fetch(`${EL_BASE}/v1/convai/agents/${id}`, {
    method: "PATCH",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${id} -> HTTP ${r.status} ${await r.text()}`);
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!supabaseUrl || !serviceRoleKey || !elKey) {
    console.error(
      "[lang-backfill] env missing — need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY",
    );
    process.exit(2);
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb
    .from("agents")
    .select("id, tenant_id, provider_agent_id")
    .order("id", { ascending: true });
  if (error) {
    console.error(`[lang-backfill] supabase select failed: ${error.message}`);
    process.exit(1);
  }
  const rows = (data ?? []) as AgentRow[];
  console.log(`[lang-backfill] found ${rows.length} agent row(s)`);

  let ok = 0;
  let already = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.provider_agent_id) {
      skipped += 1;
      console.log(
        `[lang-backfill] row=${row.id} tenant=${row.tenant_id} skip (no provider_agent_id)`,
      );
      continue;
    }
    const id = row.provider_agent_id;
    try {
      const cfg = await elGet(id, elKey);
      const promptObj = cfg?.conversation_config?.agent?.prompt;
      if (!promptObj || typeof promptObj.prompt !== "string") {
        throw new Error("no conversation_config.agent.prompt.prompt");
      }
      if (promptObj.prompt.includes(MARKER)) {
        already += 1;
        console.log(`[lang-backfill] agent=${id} tenant=${row.tenant_id} already has rule`);
        continue;
      }
      const hadToolIds = Array.isArray(promptObj.tool_ids) ? promptObj.tool_ids.length : 0;
      promptObj.prompt = promptObj.prompt + RULE;
      // EL rejects a PATCH that carries BOTH inline `tools` and `tool_ids`.
      // Keep the migrated workspace-catalog tool_ids; drop the legacy inline tools.
      if (Array.isArray(promptObj.tool_ids) && promptObj.tool_ids.length > 0) {
        delete promptObj.tools;
      } else if (promptObj.tools !== undefined) {
        delete promptObj.tool_ids;
      }
      await elPatch(id, elKey, { conversation_config: { agent: { prompt: promptObj } } });

      // verify
      const after = await elGet(id, elKey);
      const ap = after?.conversation_config?.agent?.prompt;
      const rulePresent = typeof ap?.prompt === "string" && ap.prompt.includes(MARKER);
      const toolIdsAfter = Array.isArray(ap?.tool_ids) ? ap.tool_ids.length : 0;
      if (!rulePresent) throw new Error("rule not present after PATCH");
      if (hadToolIds > 0 && toolIdsAfter < hadToolIds) {
        console.warn(
          `[lang-backfill] agent=${id} WARNING tool_ids changed ${hadToolIds}->${toolIdsAfter}`,
        );
      }
      ok += 1;
      console.log(
        `[lang-backfill] agent=${id} tenant=${row.tenant_id} OK (tool_ids ${hadToolIds}->${toolIdsAfter})`,
      );
    } catch (e) {
      failed += 1;
      console.error(
        `[lang-backfill] agent=${id} tenant=${row.tenant_id} FAIL: ${(e as Error).message}`,
      );
    }
  }
  console.log(
    `[lang-backfill] done — patched=${ok} already=${already} skipped=${skipped} failed=${failed} total=${rows.length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[lang-backfill] crashed:", e);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Re-scrape + re-consolidate an already-provisioned clinic and swap the
 * agent's tenant KB document in place (ontology docs re-attached by
 * updateAgentKnowledge). Use after a scraper/consolidation fix lands and
 * the live KB carries the old defect — e.g. the 2026-06-06 day-range
 * hours truncation (DCI) and the missing /cennik discovery pass (Anna).
 *
 * The old tenant KB doc is deleted afterwards (best-effort): EL refuses
 * to delete documents still attached to an agent, so this is safe by
 * construction.
 *
 * Usage:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/rebuild-clinic-kb.ts <tenant-name>
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createFirecrawlClient,
  scrapeAndConsolidate,
  scraperOutputToMarkdown,
} from "../src/scraper/index.js";
import { LLMClient } from "../src/lib/llm.js";
import { createGeminiProvider } from "../src/lib/gemini-provider.js";
import { ElevenLabsConvAIProvider } from "../src/orchestration/elevenlabs-convai.js";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env missing: ${k}`);
  return v;
};

const tenantName = process.argv[2];
if (!tenantName) {
  console.error("usage: rebuild-clinic-kb.ts <tenant-name>");
  process.exit(2);
}

const supabase = createClient(
  process.env.SUPABASE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const firecrawl = createFirecrawlClient({ apiKey: env("FIRECRAWL_API_KEY") });
const llm = new LLMClient(createGeminiProvider({ apiKey: env("GEMINI_API_KEY") }), {});
const provider = new ElevenLabsConvAIProvider({ apiKey: env("ELEVENLABS_API_KEY") });
const elKey = env("ELEVENLABS_API_KEY");

// Duplicate tenant rows exist for some clinics (early provisioning
// attempts, e.g. Dynasty Stomatology ×3) — resolve via the agents join:
// the tenant row that owns a live elevenlabs agent is the real one.
const { data: tenantRows, error: tErr } = await supabase
  .from("tenants")
  .select("id, name, source_url")
  .ilike("name", `%${tenantName}%`);
if (tErr || !tenantRows?.length)
  throw new Error(`tenant '${tenantName}' not found: ${tErr?.message}`);

let tenant: { id: string; name: string; source_url: string | null } | null = null;
let agent: { id: string; provider_agent_id: string } | null = null;
for (const row of tenantRows) {
  const { data: a } = await supabase
    .from("agents")
    .select("id, provider_agent_id")
    .eq("tenant_id", row.id)
    .eq("provider", "elevenlabs")
    .maybeSingle();
  if (a) {
    if (agent) throw new Error(`multiple agents match tenant '${tenantName}' — be more specific`);
    tenant = row;
    agent = a;
  }
}
if (!tenant || !agent) throw new Error(`no elevenlabs agent found for tenant '${tenantName}'`);
if (!tenant.source_url) throw new Error(`tenant '${tenant.name}' has no source_url`);

console.log(`tenant: ${tenant.name} (${tenant.id})`);
console.log(`agent:  ${agent.provider_agent_id}`);
console.log(`source: ${tenant.source_url}`);

// Snapshot the currently attached tenant KB doc (for post-swap deletion).
const agentRes = await fetch(
  `https://api.elevenlabs.io/v1/convai/agents/${agent.provider_agent_id}`,
  { headers: { "xi-api-key": elKey } },
);
const agentCfg = (await agentRes.json()) as {
  conversation_config?: {
    agent?: { prompt?: { knowledge_base?: Array<{ id: string; name: string }> } };
  };
};
const attachedDocs = agentCfg.conversation_config?.agent?.prompt?.knowledge_base ?? [];
const oldTenantDocs = attachedDocs.filter((d) => !d.name.startsWith("ontology"));
console.log(`currently attached tenant docs: ${oldTenantDocs.map((d) => d.id).join(", ") || "—"}`);

// 1. fresh scrape + consolidate (current pipeline, all fixes active)
const output = await scrapeAndConsolidate({
  url: tenant.source_url,
  firecrawl,
  llm,
  onPage: (p) =>
    console.log(
      p.error
        ? `  page ${p.url} FAILED: ${p.error.slice(0, 120)}`
        : `  page ${p.url} -> ${p.chars} chars`,
    ),
});
const markdown = scraperOutputToMarkdown(output);
const priced = (markdown.match(/Cena: (?!nieznana)/g) ?? []).length;
console.log(
  `KB: ${markdown.length} chars | priced: ${priced} | phone: ${output.tenant?.phone ?? "—"}`,
);
if (markdown.length < 1500) {
  console.error("ABORT: new KB too thin — keeping the existing document");
  process.exit(1);
}

// Price-regression gate (mas-stomatologia.pl lesson, 2026-06-06): a
// consolidation price-dropout produced a 0-priced KB that was swapped onto
// a live agent whose old KB may have carried prices. Never regress a live
// agent's pricing: compare against the currently attached doc and abort.
if (oldTenantDocs.length > 0) {
  const oldContent = await (
    await fetch(
      `https://api.elevenlabs.io/v1/convai/knowledge-base/${oldTenantDocs[0]!.id}/content`,
      { headers: { "xi-api-key": elKey } },
    )
  ).text();
  const oldPriced = (oldContent.match(/Cena: (?!nieznana)/g) ?? []).length;
  console.log(`price gate: old KB priced=${oldPriced}, new KB priced=${priced}`);
  if (oldPriced > 0 && priced === 0) {
    console.error(
      "ABORT: price regression (old KB priced, new KB 0) — keeping the existing document",
    );
    process.exit(1);
  }
}

const slug = tenant.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const kbDir = path.resolve(process.cwd(), "../../data/clinics", slug);
mkdirSync(kbDir, { recursive: true });
writeFileSync(path.join(kbDir, "knowledge.md"), markdown);
// Persist the consolidated JSON too: renderer-only fixes can then re-render
// knowledge.md without burning Firecrawl credits on a re-scrape.
writeFileSync(path.join(kbDir, "scraper-output.json"), JSON.stringify(output, null, 2));
console.log(`KB saved: data/clinics/${slug}/knowledge.md (+ scraper-output.json)`);

// 2. upload new doc (waits for RAG index) + swap onto the agent
const kb = await provider.uploadKnowledgeDocument({
  tenantId: tenant.id,
  name: `${tenant.name} — knowledge`,
  markdown,
});
console.log(`new KB doc: ${kb.documentId}`);
await provider.updateAgentKnowledge({
  agentId: agent.provider_agent_id,
  knowledgeBaseDocumentIds: [kb.documentId],
  tenantDisplayName: tenant.name,
});
console.log("agent KB swapped (ontology docs re-attached)");

// 3. best-effort delete of the detached old docs
for (const doc of oldTenantDocs) {
  const del = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${doc.id}`, {
    method: "DELETE",
    headers: { "xi-api-key": elKey },
  });
  console.log(`old doc ${doc.id} delete: ${del.status}`);
}

console.log(
  "\nNext: refresh CORE CLINIC FACTS from the new KB:\n  pnpm -F @ai-receptionist/backend exec tsx scripts/push-system-prompt.ts",
);

#!/usr/bin/env tsx
/**
 * Batch-provision demo agents for cold-outreach clinics, end to end:
 *   scrape → consolidate → KB markdown → tenant + agent (EL) → PIN →
 *   assign behind the demo phone line (PIN mode).
 *
 * Mirrors the wizard flow (/api/prepare + /api/provision) headlessly; the
 * KB review step is replaced by automated validation (priced-services count,
 * coverage warnings printed for the operator to eyeball).
 *
 * Usage:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/batch-provision-demo.ts \
 *     '[{"name":"WaDental","url":"https://wadental.pl"}]'
 *
 * Sequential per clinic (Firecrawl + Gemini rate limits). ~2-4 min each,
 * ~26 Firecrawl credits each (1 map + ≤25 scrapes).
 */
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import {
  createFirecrawlClient,
  scrapeAndConsolidate,
  scraperOutputToMarkdown,
} from "../src/scraper/index.js";
import { LLMClient } from "../src/lib/llm.js";
import { createGeminiProvider } from "../src/lib/gemini-provider.js";
import { ElevenLabsConvAIProvider } from "../src/orchestration/elevenlabs-convai.js";
import { buildSystemPrompt, extractPolishCity } from "../src/prompts/system-prompt.js";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env missing: ${k}`);
  return v;
};

const supabase = createClient(
  process.env.SUPABASE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const clinics: Array<{ name: string; url: string }> = JSON.parse(process.argv[2] ?? "[]");
if (clinics.length === 0) {
  console.error("usage: batch-provision-demo.ts '<json array of {name,url}>'");
  process.exit(2);
}

const BASE = "https://ai-receptionist-seven-sigma.vercel.app";
const firecrawl = createFirecrawlClient({ apiKey: env("FIRECRAWL_API_KEY") });
const llm = new LLMClient(createGeminiProvider({ apiKey: env("GEMINI_API_KEY") }), {});
const provider = new ElevenLabsConvAIProvider({ apiKey: env("ELEVENLABS_API_KEY") });

// Operator id for audit columns: reuse the id that provisioned the fleet.
const { data: anyAgent } = await supabase
  .from("agents")
  .select("provisioned_by_user_id")
  .not("provisioned_by_user_id", "is", null)
  .limit(1)
  .single();
const operatorId = anyAgent?.provisioned_by_user_id ?? null;

async function generatePin(agentRowId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await supabase.from("agents").update({ pin_code: pin }).eq("id", agentRowId);
    if (!error) return pin;
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("pin generation failed after 5 attempts");
}

const summary: string[] = [];
for (const clinic of clinics) {
  console.log(`\n===== ${clinic.name} (${clinic.url})`);
  try {
    // skip if a tenant with this source already exists
    const { data: existing } = await supabase
      .from("tenants")
      .select("id, name")
      .ilike("name", clinic.name)
      .maybeSingle();
    if (existing) {
      console.log(`  SKIP: tenant '${existing.name}' already exists (${existing.id})`);
      summary.push(`${clinic.name}: SKIPPED (exists)`);
      continue;
    }

    // 1. scrape + consolidate
    const output = await scrapeAndConsolidate({ url: clinic.url, firecrawl, llm });
    const markdown = scraperOutputToMarkdown(output);
    const priced = (markdown.match(/Cena: (?!nieznana)/g) ?? []).length;
    const unknown = (markdown.match(/Cena: nieznana/g) ?? []).length;
    console.log(
      `  KB: ${markdown.length} chars | priced: ${priced} | unknown: ${unknown} | phone: ${output.tenant?.phone ?? "—"}`,
    );
    if (markdown.length < 1500 || priced === 0) {
      console.log("  ABORT: KB too thin (needs operator review) — not provisioning");
      summary.push(`${clinic.name}: ABORTED (thin KB: ${markdown.length} chars, ${priced} priced)`);
      continue;
    }

    // 2. tenant
    const { data: tenantRow, error: tErr } = await supabase
      .from("tenants")
      .insert({
        name: output.tenant?.name ?? clinic.name,
        display_name: output.tenant?.name ?? clinic.name,
        source_url: clinic.url,
        provisioned_by_user_id: operatorId,
      })
      .select("id")
      .single();
    if (tErr || !tenantRow) throw new Error(`tenant insert: ${tErr?.message}`);

    // 3. KB upload + agent provision (demo defaults: no booking tools,
    // guardrails, language stack, attached tests via EL_DEFAULT_TEST_IDS)
    const kb = await provider.uploadKnowledgeDocument({
      tenantId: tenantRow.id,
      name: `${clinic.name} — knowledge`,
      markdown,
    });
    const detectedCity = extractPolishCity(output.tenant?.address);
    const systemPrompt = buildSystemPrompt({
      tenantDisplayName: output.tenant?.name ?? clinic.name,
      ...(detectedCity ? { city: detectedCity } : {}),
    });
    const prov = await provider.provisionAgent({
      tenantId: tenantRow.id,
      tenantDisplayName: output.tenant?.name ?? clinic.name,
      knowledgeBaseDocumentIds: [kb.documentId],
      serverToolBaseUrl: `${BASE}/api`,
      postCallWebhookUrl: `${BASE}/api/post-call`,
      defaultLanguage: "pl",
      systemPromptOverride: systemPrompt,
    });

    // 4. agents row + PIN
    const { data: agentRow, error: aErr } = await supabase
      .from("agents")
      .insert({
        tenant_id: tenantRow.id,
        provider: "elevenlabs",
        provider_agent_id: prov.agentId,
        voice_id: null,
        default_language: "pl",
        status: "live",
        provisioned_by_user_id: operatorId,
      })
      .select("id")
      .single();
    if (aErr || !agentRow) throw new Error(`agents insert: ${aErr?.message}`);
    const pin = await generatePin(agentRow.id);

    console.log(`  agent: ${prov.agentId} | PIN: ${pin}`);
    summary.push(`${clinic.name}: OK | PIN ${pin} | priced ${priced} | ${prov.agentId}`);
  } catch (e) {
    console.error(`  FAILED: ${(e as Error).message.slice(0, 300)}`);
    summary.push(`${clinic.name}: FAILED (${(e as Error).message.slice(0, 120)})`);
  }
}

console.log("\n===== BATCH SUMMARY =====");
for (const line of summary) console.log(line);
console.log(
  "\nNext: assign new agents to the line: pnpm -F @ai-receptionist/backend exec tsx scripts/assign-demo-line-agents.ts <uuid...>",
);

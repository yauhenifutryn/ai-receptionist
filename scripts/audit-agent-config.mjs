// Read-only audit of a provisioned EL agent against the fleet contract:
//   llm = gemini-3.1-flash-lite (commit 8540bb9)
//   rag = { enabled, multilingual_e5_large_instruct, 20 chunks }
//   KB doc indexed ("succeeded") for that embedding model
//   CORE CLINIC FACTS present in the system prompt
//   TTS flash_v2_5, audio recording OFF (RODO hard rule)
// Usage: node --env-file=.env.local scripts/audit-agent-config.mjs <agent_id>
const AGENT = process.argv[2];
const KEY = process.env.ELEVENLABS_API_KEY;
if (!AGENT || !KEY) {
  console.error("usage: node --env-file=.env.local scripts/audit-agent-config.mjs <agent_id>");
  process.exit(2);
}
const H = { "xi-api-key": KEY };

const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT}`, { headers: H });
if (!res.ok) {
  console.error(`agent fetch failed ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const agent = await res.json();
const cc = agent.conversation_config ?? {};
const prompt = cc.agent?.prompt ?? {};

console.log(`agent: ${agent.name} (${AGENT})`);
console.log(`llm: ${prompt.llm} | temperature: ${prompt.temperature}`);
console.log(`rag: ${JSON.stringify(prompt.rag)}`);
console.log(
  `tts: model=${cc.tts?.model_id} voice=${cc.tts?.voice_id} speed=${cc.tts?.speed} opt=${cc.tts?.optimize_streaming_latency}`,
);
console.log(`asr language: ${cc.agent?.language} | additional: ${JSON.stringify(cc.language_presets ? Object.keys(cc.language_presets) : [])}`);
const priv = agent.platform_settings?.privacy ?? {};
console.log(`privacy: record_voice=${priv.record_voice} retention_days=${priv.retention_days} delete_audio=${priv.delete_audio}`);
console.log(`auth/overrides keys: ${JSON.stringify(Object.keys(agent.platform_settings ?? {}))}`);

const kb = prompt.knowledge_base ?? [];
console.log(`\nKB docs: ${kb.length}`);
for (const d of kb) {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${d.id}/rag-index`, {
    headers: H,
  });
  let status = "?";
  if (r.ok) {
    const j = await r.json();
    status = (j.indexes ?? []).map((x) => `${x.model}:${x.status}`).join(", ") || "no indexes";
  } else {
    status = `rag-index fetch ${r.status}`;
  }
  console.log(`  - ${d.name} [${d.usage_mode ?? d.type}] id=${d.id}`);
  console.log(`    index: ${status}`);
}

const sys = prompt.prompt ?? "";
const factsIdx = sys.indexOf("CORE CLINIC FACTS");
console.log(`\nsystem prompt: ${sys.length} chars | CORE CLINIC FACTS: ${factsIdx >= 0 ? "present" : "MISSING"}`);
if (factsIdx >= 0) {
  const block = sys.slice(factsIdx, factsIdx + 700);
  console.log("--- CORE CLINIC FACTS block (first 700 chars) ---");
  console.log(block);
}

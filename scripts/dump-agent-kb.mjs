// Pull the live, provisioned KB doc(s) for an EL agent so we can audit
// accuracy against the real website. Read-only.
// Usage: node --env-file=.env.local scripts/dump-agent-kb.mjs <agent_id>
const AGENT = process.argv[2];
const KEY = process.env.ELEVENLABS_API_KEY;
if (!AGENT || !KEY) {
  console.error("usage: node --env-file=.env.local scripts/dump-agent-kb.mjs <agent_id>");
  process.exit(2);
}
const H = { "xi-api-key": KEY };

const agentRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT}`, { headers: H });
if (!agentRes.ok) {
  console.error(`agent fetch failed ${agentRes.status}: ${await agentRes.text()}`);
  process.exit(1);
}
const agent = await agentRes.json();
const kb = agent?.conversation_config?.agent?.prompt?.knowledge_base ?? [];
console.log(`KB docs attached: ${kb.length}`);
for (const d of kb) console.log(`  - ${d.name} [${d.type}] id=${d.id}`);

// Fetch content for each doc. EL exposes the extracted text at /content.
for (const d of kb) {
  let text = "";
  for (const ep of [
    `https://api.elevenlabs.io/v1/convai/knowledge-base/${d.id}/content`,
    `https://api.elevenlabs.io/v1/convai/knowledge-base/${d.id}`,
  ]) {
    const r = await fetch(ep, { headers: H });
    if (!r.ok) continue;
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = await r.json();
      text = j.extracted_inner_html ?? j.text ?? j.content ?? JSON.stringify(j).slice(0, 200);
    } else {
      text = await r.text();
    }
    if (text) break;
  }
  console.log(`\n========== ${d.name} (${text.length} chars) ==========`);
  console.log(text);
}

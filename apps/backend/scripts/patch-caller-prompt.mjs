// Re-apply the caller agent's prompt + LLM (GET, mutate, PATCH to preserve built_in_tools).
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/patch-caller-prompt.mjs
import { SYSTEM_PROMPT } from "../src/caller/prompt.mjs";
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT = process.env.CALLER_AGENT_ID;
const url = `https://api.elevenlabs.io/v1/convai/agents/${AGENT}`;
const h = { "xi-api-key": KEY, "Content-Type": "application/json" };
const get = await (await fetch(url, { headers: h })).json();
const prompt = get.conversation_config.agent.prompt;
prompt.prompt = SYSTEM_PROMPT;
prompt.llm = "gemini-2.5-flash";
const r = await fetch(url, { method: "PATCH", headers: h, body: JSON.stringify({ conversation_config: { agent: { prompt } } }) });
const j = await r.json();
if (!r.ok) throw new Error(`patch -> ${r.status} ${JSON.stringify(j)}`);
console.log("patched. llm:", j.conversation_config?.agent?.prompt?.llm);

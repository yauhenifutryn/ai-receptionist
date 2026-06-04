// Provision the caller agent (Kamil voice, flash model, research prompt, no-pitch guardrail).
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/provision-caller-agent.mjs
import { SYSTEM_PROMPT, FIRST_MESSAGE } from "../src/caller/prompt.mjs";
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.CALLER_AGENT_VOICE_ID;
const FORWARD = process.env.FOUNDER_FORWARD_NUMBER;
const NAME = process.env.FOUNDER_NAME || "Jenya";
const SPEED = Number(process.env.CALLER_AGENT_TTS_SPEED || 0.9);
if (!KEY || !VOICE || !FORWARD) throw new Error("Missing ELEVENLABS_API_KEY / CALLER_AGENT_VOICE_ID / FOUNDER_FORWARD_NUMBER");
const h = { "xi-api-key": KEY, "Content-Type": "application/json" };

const body = {
  name: "Caller Agent — clinic research (founder)",
  conversation_config: {
    agent: {
      first_message: FIRST_MESSAGE,
      language: "pl",
      dynamic_variables: { dynamic_variable_placeholders: { founder_name: NAME, clinic_name: "" } },
      prompt: {
        prompt: SYSTEM_PROMPT,
        llm: "qwen36-35b-a3b",
        temperature: 0.3,
        built_in_tools: {
          end_call: { name: "end_call", description: "", params: { system_tool_type: "end_call" } },
          language_detection: { name: "language_detection", description: "", params: { system_tool_type: "language_detection" } },
          voicemail_detection: { name: "voicemail_detection", description: "", params: { system_tool_type: "voicemail_detection" } },
          transfer_to_number: {
            name: "transfer_to_number",
            description: "Transfer to the founder when the clinic explicitly wants a live human.",
            params: {
              system_tool_type: "transfer_to_number",
              transfers: [
                {
                  transfer_destination: { type: "phone", phone_number: FORWARD },
                  condition: "The clinic asks to speak with the founder directly now, or explicitly wants a live human.",
                },
              ],
            },
          },
        },
      },
    },
    tts: { voice_id: VOICE, model_id: "eleven_flash_v2_5", stability: 0.5, similarity_boost: 0.85, speed: SPEED },
  },
  platform_settings: {
    privacy: { record_voice: false, store_call_audio: false, retain_call_data_days: 0 },
    guardrails: {
      version: "1",
      focus: { is_enabled: true },
      prompt_injection: { is_enabled: true },
      custom: {
        config: {
          configs: [
            {
              is_enabled: true,
              name: "No pitch unless asked",
              prompt:
                "Block the agent from describing, promoting, pricing, or offering the product or demo UNLESS the clinic has explicitly asked who is calling or whether a solution exists. Pure research questions are always allowed. On any refusal or disinterest, the agent must thank and end, not pitch.",
              execution_mode: "blocking",
              trigger_action: { type: "retry", feedback: "Reason: {{trigger_reason}}. Return to research-only or end politely." },
            },
          ],
        },
      },
    },
  },
};

const r = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", { method: "POST", headers: h, body: JSON.stringify(body) });
const j = await r.json();
if (!r.ok) throw new Error(`create agent -> ${r.status} ${JSON.stringify(j)}`);
console.log("\n=== SAVE INTO .env.local ===");
console.log(`CALLER_AGENT_ID=${j.agent_id}`);

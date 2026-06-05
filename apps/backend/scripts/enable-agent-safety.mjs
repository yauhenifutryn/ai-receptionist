// Enable the EL safety + multilingual stack on live agents (idempotent):
//   - guardrails: focus, prompt_injection (manipulation), all content
//     categories EXCEPT medical_and_legal_information (a dental receptionist
//     legitimately discusses medical-adjacent content — that category would
//     false-positive on core conversations), custom "no-fake-bookings" rule
//     (streaming + end_call; retry-mode needs blocking execution which gates
//     every spoken turn — too much latency for voice).
//   - language_detection built-in system tool + en/ru language_presets so
//     ASR/TTS actually switch with the caller instead of relying purely on
//     prompt-level mirroring (random RU drift observed on a live call
//     2026-06-05).
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/enable-agent-safety.mjs [agent_uuid ...]
// With no args, sweeps every live agent.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("../../web/node_modules/@supabase/supabase-js");

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!EL_KEY || !URL_ || !SRK) throw new Error("env missing");
const h = { "xi-api-key": EL_KEY, "Content-Type": "application/json" };

const sb = createClient(URL_, SRK);
let q = sb.from("agents").select("id, provider_agent_id, tenants(name)").eq("status", "live");
const onlyIds = process.argv.slice(2);
if (onlyIds.length > 0) q = q.in("id", onlyIds);
const { data: agents, error } = await q;
if (error) throw new Error(error.message);

const guardrails = {
  version: "1",
  focus: { is_enabled: true },
  prompt_injection: { is_enabled: true },
  content: {
    execution_mode: "streaming",
    config: {
      sexual: { is_enabled: true, threshold: "medium" },
      violence: { is_enabled: true, threshold: "medium" },
      harassment: { is_enabled: true, threshold: "medium" },
      self_harm: { is_enabled: true, threshold: "medium" },
      profanity: { is_enabled: true, threshold: "medium" },
      religion_or_politics: { is_enabled: true, threshold: "medium" },
      medical_and_legal_information: { is_enabled: false, threshold: "medium" },
    },
    trigger_action: { type: "end_call" },
  },
  custom: {
    config: {
      configs: [
        {
          is_enabled: true,
          name: "no-fake-bookings",
          prompt:
            "Violation: the agent states or implies that an appointment has been successfully booked, rescheduled, or cancelled, or reads out a booking confirmation. The agent is a demo with no calendar access — when asked to book it must explain that limitation instead. Explaining the demo limitation is NOT a violation.",
          execution_mode: "streaming",
          trigger_action: { type: "end_call" },
        },
      ],
    },
  },
};

for (const a of agents ?? []) {
  const tenant = a.tenants?.name ?? "the clinic";
  const body = {
    conversation_config: {
      language_presets: {
        en: {
          overrides: {
            agent: {
              first_message: `Hello, this is Michał, the AI assistant at ${tenant}. How can I help?`,
            },
            tts: null,
          },
        },
        ru: {
          overrides: {
            agent: {
              first_message: `Здравствуйте, я Михаил, AI-ассистент клиники ${tenant}. Чем могу помочь?`,
            },
            tts: null,
          },
        },
      },
      agent: {
        prompt: {
          built_in_tools: { language_detection: { name: "language_detection", description: "" } },
        },
      },
    },
    platform_settings: { guardrails },
  };
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${a.provider_agent_id}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`${tenant}: PATCH ${r.status} ${(await r.text()).slice(0, 200)}`);
    continue;
  }
  // Verify by GET — EL has a history of 200-but-dropped fields.
  const g = await (
    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${a.provider_agent_id}`, {
      headers: { "xi-api-key": EL_KEY },
    })
  ).json();
  const gr = g.platform_settings?.guardrails;
  const ok =
    g.conversation_config?.agent?.prompt?.built_in_tools?.language_detection != null &&
    Object.keys(g.conversation_config?.language_presets ?? {}).length >= 2 &&
    gr?.focus?.is_enabled === true &&
    gr?.prompt_injection?.is_enabled === true &&
    gr?.content?.config?.sexual?.is_enabled === true &&
    gr?.content?.config?.medical_and_legal_information?.is_enabled === false &&
    (gr?.custom?.config?.configs ?? []).some((c) => c.name === "no-fake-bookings");
  console.log(`${tenant}: ${ok ? "OK (verified by GET)" : "MISMATCH — inspect manually"}`);
}

// apps/backend/scripts/import-demo-line-el.mjs
// 1. Import the demo DID into ElevenLabs as a sip_trunk phone-number resource
//    (inbound only — no outbound from the demo line).
// 2. Seed the phone_lines row so the dashboard pool sees it.
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/import-demo-line-el.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("../../web/node_modules/@supabase/supabase-js");

const EL_KEY = process.env.ELEVENLABS_API_KEY;
const NUMBER = process.env.TELNYX_DEMO_LINE_NUMBER;
const NUMBER_ID = process.env.TELNYX_DEMO_NUMBER_ID;
if (!EL_KEY || !NUMBER) throw new Error("Missing ELEVENLABS_API_KEY or TELNYX_DEMO_LINE_NUMBER");
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const res = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
  method: "POST",
  headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    phone_number: NUMBER,
    label: "Demo line (Telnyx)",
    provider: "sip_trunk",
    inbound_trunk_config: { media_encryption: "allowed" },
  }),
});
if (!res.ok) throw new Error(`EL import -> ${res.status} ${await res.text()}`);
const created = await res.json();
const phoneNumberId = created.phone_number_id ?? created.id;
if (!phoneNumberId) throw new Error(`EL import returned no id: ${JSON.stringify(created)}`);
console.log("EL phone_number_id:", phoneNumberId);

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await supabase.from("phone_lines").insert({
  e164: NUMBER,
  provider: "telnyx",
  telnyx_number_id: NUMBER_ID ?? null,
  mode: "direct",
  el_phone_number_id: phoneNumberId,
});
if (error) throw new Error(`phone_lines seed failed: ${error.message}`);
console.log("phone_lines row seeded. Pool is live in the dashboard.");

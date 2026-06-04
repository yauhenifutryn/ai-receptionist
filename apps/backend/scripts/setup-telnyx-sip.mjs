// Telnyx SIP wiring for the caller agent: outbound voice profile + credential connection
// (ElevenLabs authenticates against it) + assign the DID (clears "Required for calls").
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/setup-telnyx-sip.mjs
const KEY = process.env.TELNYX_API_KEY;
const NUMBER = process.env.TELNYX_CALLER_NUMBER; // +48585006116
if (!KEY || !NUMBER) throw new Error("Missing TELNYX_API_KEY or TELNYX_CALLER_NUMBER");
const base = "https://api.telnyx.com/v2";
const h = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j.data ?? j;
};

// 1. Outbound voice profile scoped to Poland with a hard daily spend cap (pilot safety).
const ovp = await api("POST", "/outbound_voice_profiles", {
  name: "caller-agent-pl",
  traffic_type: "conversational",
  service_plan: "global",
  whitelisted_destinations: ["PL"],
  daily_spend_limit: "5.00",
  daily_spend_limit_enabled: true,
  concurrent_call_limit: 1,
});
console.log("OVP:", ovp.id);

// 2. Credential connection ElevenLabs uses to authenticate outbound INVITEs.
const user = `el${Math.random().toString(36).slice(2, 12)}`; // alphanumeric, 4-32
const pass = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2).toUpperCase()}`;
const conn = await api("POST", "/credential_connections", {
  connection_name: "elevenlabs-caller",
  user_name: user,
  password: pass,
  transport_protocol: "TLS",
  outbound: { outbound_voice_profile_id: ovp.id },
});
console.log("Connection:", conn.id);

// 3. Assign the DID to the connection -> clears "Required for calls".
const numbers = await api("GET", `/phone_numbers?filter[phone_number]=${encodeURIComponent(NUMBER)}`);
const numId = (Array.isArray(numbers) ? numbers[0] : numbers)?.id;
if (!numId) throw new Error("DID not found in account");
await api("PATCH", `/phone_numbers/${numId}`, { connection_id: conn.id });

console.log("\n=== SAVE THESE INTO .env.local ===");
console.log(`TELNYX_SIP_USER=${user}`);
console.log(`TELNYX_SIP_PASSWORD=${pass}`);
console.log(`TELNYX_CONNECTION_ID=${conn.id}`);
console.log(`TELNYX_OVP_ID=${ovp.id}`);

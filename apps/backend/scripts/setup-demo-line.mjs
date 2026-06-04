// apps/backend/scripts/setup-demo-line.mjs
// Demo-line Telnyx wiring (separate from the caller agent's objects):
//  1. FQDN connection → routes inbound DID traffic to sip.rtc.elevenlabs.io
//     (TLS 5061, +E.164 format). Used in DIRECT mode.
//  2. TeXML application → voice webhook at our Vercel route. Used in PIN mode.
//  3. Assign the DID to the FQDN connection (direct mode default). Skipped
//     with a warning while the number order is still in regulatory review —
//     re-run the script once the DID is active to complete this step.
// Idempotence: pass TELNYX_DEMO_FQDN_CONNECTION_ID / TELNYX_DEMO_TEXML_APP_ID
// in env to skip creating those objects again on re-runs.
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/setup-demo-line.mjs
const KEY = process.env.TELNYX_API_KEY;
const NUMBER = process.env.TELNYX_DEMO_LINE_NUMBER;
const SITE = process.env.DEMO_LINE_BASE_URL ?? "https://ai-receptionist-seven-sigma.vercel.app";
if (!KEY || !NUMBER) throw new Error("Missing TELNYX_API_KEY or TELNYX_DEMO_LINE_NUMBER");
const base = "https://api.telnyx.com/v2";
const h = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j.data ?? j;
};

// 1. FQDN connection for direct mode (inbound → ElevenLabs).
let connId = process.env.TELNYX_DEMO_FQDN_CONNECTION_ID;
if (connId) {
  console.log("FQDN connection (from env, skipping create):", connId);
} else {
  const conn = await api("POST", "/fqdn_connections", {
    connection_name: "demo-line-direct-to-elevenlabs",
    transport_protocol: "TLS",
    inbound: {
      ani_number_format: "+E.164",
      dnis_number_format: "+e164",
      sip_region: "Europe",
    },
  });
  connId = conn.id;
  console.log("FQDN connection created:", connId);
  await api("POST", "/fqdns", {
    connection_id: connId,
    fqdn: "sip.rtc.elevenlabs.io",
    dns_record_type: "a",
    port: 5061,
  });
  console.log("FQDN attached: sip.rtc.elevenlabs.io:5061");
}

// 2. TeXML app for pin mode.
let appId = process.env.TELNYX_DEMO_TEXML_APP_ID;
if (appId) {
  console.log("TeXML app (from env, skipping create):", appId);
} else {
  const app = await api("POST", "/texml_applications", {
    friendly_name: "demo-line-pin-ivr",
    voice_url: `${SITE}/api/telnyx/demo-line`,
    voice_method: "post",
  });
  appId = app.id;
  console.log("TeXML app created:", appId, "→", `${SITE}/api/telnyx/demo-line`);
}

// 3. Assign DID to the FQDN connection (direct mode default).
const nums = await api("GET", `/phone_numbers?filter[phone_number]=${encodeURIComponent(NUMBER)}`);
const numId = (Array.isArray(nums) ? nums[0] : nums)?.id;
if (!numId) {
  console.warn(
    `WARN: DID ${NUMBER} not active in the account yet (order in regulatory review?). ` +
      "Re-run this script after activation to assign it to the FQDN connection.",
  );
} else {
  await api("PATCH", `/phone_numbers/${numId}`, { connection_id: connId });
  console.log("DID assigned to FQDN connection (direct mode). Number id:", numId);
  console.log(`TELNYX_DEMO_NUMBER_ID=${numId}`);
}

console.log("\n=== ADD TO .env.local AND VERCEL PROD (if not present) ===");
console.log(`TELNYX_DEMO_FQDN_CONNECTION_ID=${connId}`);
console.log(`TELNYX_DEMO_TEXML_APP_ID=${appId}`);

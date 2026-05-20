/**
 * One-shot smoke probe for SMSAPI.pl. Sends a single Polish-language SMS to
 * the phone number passed as the only CLI argument. Logs the full request and
 * response so we can document the working shape in the SMS adapter.
 *
 * Run:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm -F @ai-receptionist/backend smoke:sms +48XXXXXXXXX
 *
 * Working shape (filled in after first successful run):
 *   from = ?
 *   encoding = utf-8
 *   notes = ?
 */
import process from "node:process";

const TOKEN = process.env.SMSAPI_TOKEN;
const TO = process.argv[2];

if (!TOKEN) {
  console.error("SMSAPI_TOKEN env var required");
  process.exit(1);
}
if (!TO || !/^\+\d{8,15}$/.test(TO)) {
  console.error(
    "Usage: smoke:sms <E.164 phone>  e.g.  pnpm -F backend smoke:sms +48501234567",
  );
  process.exit(1);
}

const body = new URLSearchParams({
  to: TO,
  message:
    "Test SMSAPI: zażółć gęślą jaźń. Asystent AI Receptionist – probe.",
  from: "Asystent",
  encoding: "utf-8",
  format: "json",
});

const start = Date.now();
const res = await fetch("https://api.smsapi.pl/sms.do", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});
const elapsed = Date.now() - start;
const text = await res.text();
console.log(`HTTP ${res.status} (${elapsed}ms)`);
console.log(text);
if (!res.ok) process.exit(2);

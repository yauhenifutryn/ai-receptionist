/**
 * One-shot smoke probe for Zadarma SMS API. Sends a single Polish SMS to the
 * phone number passed as the only CLI argument. Logs the full request and
 * response so we can document the working shape for the production client.
 *
 * Run:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm -F @ai-receptionist/backend smoke:zadarma-sms +48XXXXXXXXX
 *
 * Env vars required:
 *   ZADARMA_USER_KEY     — from https://my.zadarma.com/api/
 *   ZADARMA_SECRET_KEY   — from https://my.zadarma.com/api/
 *
 * Notes:
 *   - Endpoint: POST https://api.zadarma.com/v1/sms/send/
 *   - Form-encoded body (application/x-www-form-urlencoded)
 *   - Without caller_id, Zadarma uses its default international sender
 *     (SenderID registration is $20 + 15 business days for a custom sender)
 *   - Auth: HMAC-SHA1(secret, methodPath + paramsStr + md5(paramsStr)), base64
 */
import { createHash, createHmac } from "node:crypto";
import process from "node:process";

const USER_KEY = process.env.ZADARMA_USER_KEY;
const SECRET_KEY = process.env.ZADARMA_SECRET_KEY;
const TO = process.argv[2];

if (!USER_KEY || !SECRET_KEY) {
  console.error(
    "ZADARMA_USER_KEY and ZADARMA_SECRET_KEY env vars required (from https://my.zadarma.com/api/)",
  );
  process.exit(1);
}
if (!TO || !/^\+\d{8,15}$/.test(TO)) {
  console.error(
    "Usage: smoke:zadarma-sms <E.164 phone>  e.g.  pnpm -F backend smoke:zadarma-sms +48501234567",
  );
  process.exit(1);
}

// Zadarma's `to` param wants the number WITHOUT the leading +.
const toDigits = TO.slice(1);

const METHOD_PATH = "/v1/sms/send/";
const params: Record<string, string> = {
  to: toDigits,
  message: "Test Zadarma SMS: zazolc gesla jazn. Asystent — probe.",
};

// Sort params alphabetically by key, build URL-encoded string.
const sortedKeys = Object.keys(params).sort();
const paramsStr = sortedKeys
  .map(
    (k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`,
  )
  .join("&");

const md5Hash = createHash("md5").update(paramsStr).digest("hex");
const signingString = METHOD_PATH + paramsStr + md5Hash;
const signature = createHmac("sha1", SECRET_KEY)
  .update(signingString)
  .digest("base64");

const start = Date.now();
const res = await fetch(`https://api.zadarma.com${METHOD_PATH}`, {
  method: "POST",
  headers: {
    Authorization: `${USER_KEY}:${signature}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: paramsStr,
});
const elapsed = Date.now() - start;
const text = await res.text();
console.log(`HTTP ${res.status} (${elapsed}ms)`);
console.log(text);
if (!res.ok) process.exit(2);

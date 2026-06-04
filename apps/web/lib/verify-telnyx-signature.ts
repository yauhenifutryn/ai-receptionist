// apps/web/lib/verify-telnyx-signature.ts
// Telnyx webhook signature verification (Ed25519). Docs:
// https://developers.telnyx.com/docs/development/webhooks (signed payload is
// `${telnyx-timestamp}|${rawBody}`, key shown in the portal as base64 raw 32B).
// No telnyx npm dep — same rationale as verify-twilio-signature.ts.
import { createPublicKey, verify as edVerify } from "node:crypto";

/** DER/SPKI prefix for a raw Ed25519 public key (RFC 8410). */
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_SKEW_SEC = 300;

export interface TelnyxVerifyOptions {
  /** Override TELNYX_PUBLIC_KEY for tests. Present-but-undefined means
   *  "treat as unconfigured" (no env fallback). */
  publicKey?: string | null;
  /** Override clock for tests (epoch seconds). */
  nowSec?: number;
}

export type TelnyxVerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  opts: TelnyxVerifyOptions = {},
): TelnyxVerifyResult {
  const keyB64 = Object.hasOwn(opts, "publicKey") ? opts.publicKey : process.env.TELNYX_PUBLIC_KEY;
  if (!keyB64) return { ok: false, reason: "TELNYX_PUBLIC_KEY not configured" };
  if (!signatureB64 || !timestamp) return { ok: false, reason: "missing signature headers" };

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SEC) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(keyB64, "base64")]),
      format: "der",
      type: "spki",
    });
    const valid = edVerify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`),
      key,
      Buffer.from(signatureB64, "base64"),
    );
    return valid ? { ok: true } : { ok: false, reason: "signature mismatch" };
  } catch (e) {
    return { ok: false, reason: `verification threw: ${(e as Error).message}` };
  }
}

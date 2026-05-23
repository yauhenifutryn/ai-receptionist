import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request-signature verifier. Implements the algorithm from
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * For application/x-www-form-urlencoded POSTs:
 *   1. Take the full request URL (scheme://host/path?query).
 *   2. Sort POST params alphabetically by key.
 *   3. Append each key+value (no separator) to the URL string.
 *   4. HMAC-SHA1 the resulting string with the Twilio Auth Token.
 *   5. Base64-encode and compare to the `X-Twilio-Signature` header.
 *
 * Avoids adding the `twilio` npm dep — algorithm is ~20 lines and the rest
 * of that package is irrelevant to our minimal flow.
 *
 */

const SIGNATURE_HEADER = "x-twilio-signature";

export interface TwilioVerifyOptions {
  /** Override TWILIO_AUTH_TOKEN for tests. */
  authToken?: string | null;
  /** Override NODE_ENV / VERCEL_ENV for tests. */
  nodeEnv?: string;
  vercelEnv?: string;
  /** Override the URL the signature was computed over. Useful when behind
   *  a proxy that rewrites Host — pass the canonical public URL. */
  publicUrl?: string;
}

export type TwilioVerifyResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; status: number; reason: string };

export async function verifyTwilioRequest(
  req: Request,
  opts: TwilioVerifyOptions = {},
): Promise<TwilioVerifyResult> {
  const authToken =
    opts.authToken !== undefined ? opts.authToken : (process.env.TWILIO_AUTH_TOKEN ?? null);
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const vercelEnv = opts.vercelEnv ?? process.env.VERCEL_ENV ?? "";
  const isProduction = nodeEnv === "production" || vercelEnv === "production";

  if (!authToken) {
    if (isProduction) {
      return {
        ok: false,
        status: 500,
        reason:
          "TWILIO_AUTH_TOKEN not configured — refusing to accept Twilio webhooks in production",
      };
    }
    // Dev fallback: parse the form body and accept. Useful for local Twiml-CLI tests.
    const params = await parseFormSafe(req);
    return { ok: true, params };
  }

  const headerSig = req.headers.get(SIGNATURE_HEADER);
  if (!headerSig) {
    return { ok: false, status: 401, reason: "missing X-Twilio-Signature header" };
  }

  const params = await parseFormSafe(req);
  const url = opts.publicUrl ?? req.url;
  const signed = buildSignedString(url, params);
  const expected = createHmac("sha1", authToken).update(signed).digest("base64");

  if (!safeBase64Equal(expected, headerSig)) {
    return { ok: false, status: 401, reason: "signature mismatch" };
  }

  return { ok: true, params };
}

async function parseFormSafe(req: Request): Promise<Record<string, string>> {
  try {
    const form = await req.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function buildSignedString(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let s = url;
  for (const k of keys) {
    s += k + params[k];
  }
  return s;
}

function safeBase64Equal(a: string, b: string): boolean {
  const ba = Buffer.from(a, "base64");
  const bb = Buffer.from(b, "base64");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

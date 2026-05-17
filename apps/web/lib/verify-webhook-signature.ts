import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Verifies the ElevenLabs webhook signature (HMAC-SHA256 over
 * "<timestamp>.<raw_body>", keyed by ELEVENLABS_WEBHOOK_SECRET).
 *
 * Header format follows the Stripe / ElevenLabs convention:
 *   ElevenLabs-Signature: t=<unix_seconds>,v0=<hex_sha256>
 *
 * Caller MUST use the returned `rawBody` instead of req.json() — the
 * body stream has already been consumed during verification, and the
 * signature is over the exact bytes we read.
 *
 * Dev ergonomics: when ELEVENLABS_WEBHOOK_SECRET is not configured AND
 * NODE_ENV is not "production", verification is bypassed with a warning
 * so the developer can hit these routes from a local React widget that
 * doesn't sign. In production the missing secret is a hard error.
 */

const TOLERANCE_SECONDS = 300; // 5-minute replay window
const SIGNATURE_HEADER = "elevenlabs-signature";

export type VerifyResult =
  | { ok: true; rawBody: string }
  | { ok: false; status: number; reason: string };

export interface VerifyOptions {
  /** Override `Date.now()` for deterministic tests. */
  now?: () => number;
  /** Override env-resolution (for tests). */
  secret?: string | null;
  /** Override env-resolution (for tests). */
  nodeEnv?: string;
}

export async function verifyElevenLabsWebhook(
  req: NextRequest,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const rawBody = await req.text();
  const secret =
    opts.secret !== undefined
      ? opts.secret
      : process.env.ELEVENLABS_WEBHOOK_SECRET ?? null;
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const now = opts.now ?? Date.now;
  const header = req.headers.get(SIGNATURE_HEADER);

  if (!secret) {
    if (nodeEnv === "production") {
      return {
        ok: false,
        status: 500,
        reason:
          "ELEVENLABS_WEBHOOK_SECRET not configured — refusing to accept webhooks in production",
      };
    }
    // Dev fallback: log but accept. Helps local React-widget testing
    // where the browser-originated call isn't signed.
    if (!header) {
      console.warn(
        "[verify-webhook] ELEVENLABS_WEBHOOK_SECRET not set and no signature header; accepting in dev mode",
      );
      return { ok: true, rawBody };
    }
    // Header present but no secret configured — we cannot verify.
    // Still accept in dev so a partial setup doesn't block local work.
    console.warn(
      "[verify-webhook] signature header present but ELEVENLABS_WEBHOOK_SECRET not set; accepting in dev mode without verification",
    );
    return { ok: true, rawBody };
  }

  if (!header) {
    return { ok: false, status: 401, reason: "missing signature header" };
  }

  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, status: 401, reason: "malformed signature header" };
  }

  const ageSeconds = Math.abs(now() / 1000 - parsed.timestamp);
  if (!Number.isFinite(ageSeconds) || ageSeconds > TOLERANCE_SECONDS) {
    return {
      ok: false,
      status: 401,
      reason: `signature timestamp outside tolerance (age ${Math.round(ageSeconds)}s, max ${TOLERANCE_SECONDS}s)`,
    };
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("hex");

  if (!safeHexEqual(expected, parsed.signatureHex)) {
    return { ok: false, status: 401, reason: "signature mismatch" };
  }

  return { ok: true, rawBody };
}

interface ParsedSignature {
  timestamp: number;
  signatureHex: string;
}

function parseSignatureHeader(header: string): ParsedSignature | null {
  // Accept "t=<unix>,v0=<hex>" with optional whitespace and order.
  const parts = header.split(",").map((p) => p.trim());
  let t: number | null = null;
  let sig: string | null = null;
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const value = p.slice(eq + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) t = n;
    } else if (key === "v0") {
      if (/^[0-9a-f]+$/i.test(value)) sig = value.toLowerCase();
    }
  }
  if (t === null || sig === null) return null;
  return { timestamp: t, signatureHex: sig };
}

function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

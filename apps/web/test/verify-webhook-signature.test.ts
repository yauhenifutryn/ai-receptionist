import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyElevenLabsWebhook } from "../lib/verify-webhook-signature";

// Minimal NextRequest stand-in: only the fields the verifier reads.
function fakeReq(opts: { body: string; signature?: string }): import("next/server").NextRequest {
  const headers = new Map<string, string>();
  if (opts.signature !== undefined) {
    headers.set("elevenlabs-signature", opts.signature);
  }
  return {
    text: async () => opts.body,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
  } as unknown as import("next/server").NextRequest;
}

function sign(secret: string, timestamp: number, body: string): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v0=${sig}`;
}

describe("verifyElevenLabsWebhook", () => {
  const SECRET = "test-secret-abc";
  const BODY = '{"event":"post_call","at":"2026-05-23T10:00:00Z"}';
  const NOW_MS = 1747999200_000; // fixed clock
  const NOW_SEC = Math.floor(NOW_MS / 1000);
  const fixedNow = () => NOW_MS;

  it("accepts a correctly signed request", async () => {
    const req = fakeReq({ body: BODY, signature: sign(SECRET, NOW_SEC, BODY) });
    const r = await verifyElevenLabsWebhook(req, {
      secret: SECRET,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rawBody).toBe(BODY);
  });

  it("rejects a tampered body", async () => {
    const req = fakeReq({
      body: BODY.replace("post_call", "post_call_evil"),
      signature: sign(SECRET, NOW_SEC, BODY),
    });
    const r = await verifyElevenLabsWebhook(req, {
      secret: SECRET,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature mismatch");
  });

  it("rejects a stale signature (outside 5-minute tolerance)", async () => {
    const stale = NOW_SEC - 600; // 10 minutes old
    const req = fakeReq({ body: BODY, signature: sign(SECRET, stale, BODY) });
    const r = await verifyElevenLabsWebhook(req, {
      secret: SECRET,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/timestamp outside tolerance/);
  });

  it("rejects a missing signature header", async () => {
    const req = fakeReq({ body: BODY });
    const r = await verifyElevenLabsWebhook(req, {
      secret: SECRET,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing signature header");
  });

  it("rejects a malformed signature header", async () => {
    const req = fakeReq({ body: BODY, signature: "garbage-not-a-header" });
    const r = await verifyElevenLabsWebhook(req, {
      secret: SECRET,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed signature header");
  });

  it("hard-fails in production when secret is missing", async () => {
    const req = fakeReq({ body: BODY, signature: sign(SECRET, NOW_SEC, BODY) });
    const r = await verifyElevenLabsWebhook(req, {
      secret: null,
      now: fixedNow,
      nodeEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it("hard-fails when VERCEL_ENV=production even if NODE_ENV is misset (F9)", async () => {
    const req = fakeReq({ body: BODY, signature: sign(SECRET, NOW_SEC, BODY) });
    const r = await verifyElevenLabsWebhook(req, {
      secret: null,
      now: fixedNow,
      nodeEnv: "development",
      vercelEnv: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it("allows in dev when secret is missing (ergonomic fallback)", async () => {
    const req = fakeReq({ body: BODY });
    const r = await verifyElevenLabsWebhook(req, {
      secret: null,
      now: fixedNow,
      nodeEnv: "development",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rawBody).toBe(BODY);
  });
});

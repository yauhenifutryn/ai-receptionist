import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyTwilioRequest } from "../lib/verify-twilio-signature";

const TOKEN = "test-auth-token";
const URL = "https://example.com/api/twilio/inbound";

function signRequest(token: string, url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let s = url;
  for (const k of keys) s += k + params[k];
  return createHmac("sha1", token).update(s).digest("base64");
}

function fakeReq(opts: {
  params: Record<string, string>;
  signature?: string | null;
  url?: string;
}): Request {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params)) form.set(k, v);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (opts.signature !== null && opts.signature !== undefined) {
    headers["x-twilio-signature"] = opts.signature;
  }
  return new Request(opts.url ?? URL, {
    method: "POST",
    headers,
    body: form.toString(),
  });
}

describe("verifyTwilioRequest", () => {
  it("accepts a correctly signed request", async () => {
    const params = { From: "+48500000000", Digits: "1234" };
    const sig = signRequest(TOKEN, URL, params);
    const req = fakeReq({ params, signature: sig });
    const r = await verifyTwilioRequest(req, {
      authToken: TOKEN,
      nodeEnv: "production",
      publicUrl: URL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.From).toBe("+48500000000");
      expect(r.params.Digits).toBe("1234");
    }
  });

  it("rejects when signature is missing", async () => {
    const req = fakeReq({ params: { Digits: "1234" }, signature: null });
    const r = await verifyTwilioRequest(req, {
      authToken: TOKEN,
      nodeEnv: "production",
      publicUrl: URL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.reason).toMatch(/missing.*signature/i);
    }
  });

  it("rejects a tampered Digits param", async () => {
    const params = { Digits: "1234" };
    const sig = signRequest(TOKEN, URL, params);
    const tampered = { Digits: "9999" };
    const req = fakeReq({ params: tampered, signature: sig });
    const r = await verifyTwilioRequest(req, {
      authToken: TOKEN,
      nodeEnv: "production",
      publicUrl: URL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signature mismatch");
  });

  it("hard-fails in production when token is missing", async () => {
    const req = fakeReq({ params: { Digits: "1234" }, signature: "any" });
    const r = await verifyTwilioRequest(req, {
      authToken: null,
      nodeEnv: "production",
      publicUrl: URL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it("hard-fails when VERCEL_ENV=production even if NODE_ENV is misset", async () => {
    const req = fakeReq({ params: { Digits: "1234" }, signature: "any" });
    const r = await verifyTwilioRequest(req, {
      authToken: null,
      nodeEnv: "development",
      vercelEnv: "production",
      publicUrl: URL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it("accepts in dev when token is missing (ergonomic fallback)", async () => {
    const req = fakeReq({ params: { Digits: "1234" } });
    const r = await verifyTwilioRequest(req, {
      authToken: null,
      nodeEnv: "development",
      publicUrl: URL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.Digits).toBe("1234");
  });
});

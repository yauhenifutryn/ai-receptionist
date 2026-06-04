// apps/web/test/verify-telnyx-signature.test.ts
import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyTelnyxSignature } from "../lib/verify-telnyx-signature";

function makeKeyAndSign(body: string, timestamp: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const sig = sign(null, Buffer.from(`${timestamp}|${body}`), privateKey);
  // Telnyx portal shows the RAW 32-byte key base64'd; DER/SPKI is 12B prefix + raw.
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  return { publicKeyB64: rawPub.toString("base64"), signatureB64: sig.toString("base64") };
}

describe("verifyTelnyxSignature", () => {
  const body = JSON.stringify({ CallSid: "x", Digits: "123456" });

  it("accepts a valid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const { publicKeyB64, signatureB64 } = makeKeyAndSign(body, ts);
    const res = verifyTelnyxSignature(body, signatureB64, ts, { publicKey: publicKeyB64 });
    expect(res.ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const { publicKeyB64, signatureB64 } = makeKeyAndSign(body, ts);
    const res = verifyTelnyxSignature(body + "x", signatureB64, ts, { publicKey: publicKeyB64 });
    expect(res.ok).toBe(false);
  });

  it("rejects a stale timestamp (>5 min)", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const { publicKeyB64, signatureB64 } = makeKeyAndSign(body, ts);
    const res = verifyTelnyxSignature(body, signatureB64, ts, { publicKey: publicKeyB64 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("timestamp");
  });

  it("rejects when no public key is configured", () => {
    const res = verifyTelnyxSignature(body, "sig", String(Math.floor(Date.now() / 1000)), {
      publicKey: undefined,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("not configured");
  });

  it("rejects a malformed base64 signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const { publicKeyB64 } = makeKeyAndSign(body, ts);
    const res = verifyTelnyxSignature(body, "not!valid!base64!!!!", ts, {
      publicKey: publicKeyB64,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a wrong-length public key", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const shortKey = Buffer.alloc(16).toString("base64");
    const res = verifyTelnyxSignature(body, "anysig", ts, { publicKey: shortKey });
    expect(res.ok).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, callerIp, __resetRateLimitForTests } from "../lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("allows up to maxAttempts within the window", () => {
    for (let i = 0; i < 5; i += 1) {
      const r = checkRateLimit({ key: "k", maxAttempts: 5, windowSec: 60 });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it("blocks the (N+1)th attempt with a retry-after hint", () => {
    for (let i = 0; i < 3; i += 1) {
      checkRateLimit({ key: "k", maxAttempts: 3, windowSec: 60 });
    }
    const r = checkRateLimit({ key: "k", maxAttempts: 3, windowSec: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("isolates buckets by key", () => {
    for (let i = 0; i < 3; i += 1) {
      checkRateLimit({ key: "a", maxAttempts: 3, windowSec: 60 });
    }
    const r = checkRateLimit({ key: "b", maxAttempts: 3, windowSec: 60 });
    expect(r.allowed).toBe(true);
  });
});

describe("callerIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(callerIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(callerIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no proxy headers present", () => {
    const req = new Request("https://example.com");
    expect(callerIp(req)).toBe("unknown");
  });
});

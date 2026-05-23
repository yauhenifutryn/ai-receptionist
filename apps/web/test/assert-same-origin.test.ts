import { describe, it, expect } from "vitest";
import { assertSameOrigin } from "../lib/assert-same-origin";

function fakeReq(opts: { url: string; origin?: string | null }): import("next/server").NextRequest {
  const headers = new Map<string, string>();
  if (opts.origin) headers.set("origin", opts.origin);
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    nextUrl: new URL(opts.url),
  } as unknown as import("next/server").NextRequest;
}

describe("assertSameOrigin", () => {
  it("allows when Origin is missing (server-to-server / SameSite covers)", () => {
    const req = fakeReq({ url: "https://app.example.com/api/owner/settings" });
    expect(assertSameOrigin(req)).toBeNull();
  });

  it("allows when Origin matches the request's own origin", () => {
    const req = fakeReq({
      url: "https://app.example.com/api/owner/settings",
      origin: "https://app.example.com",
    });
    expect(assertSameOrigin(req)).toBeNull();
  });

  it("blocks with 403 when Origin is a different site", () => {
    const req = fakeReq({
      url: "https://app.example.com/api/owner/settings",
      origin: "https://evil.example.com",
    });
    const result = assertSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});

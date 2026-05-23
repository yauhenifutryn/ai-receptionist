import { NextResponse, type NextRequest } from "next/server";

/**
 * F8: CSRF defense-in-depth for cookie-auth Route Handlers.
 *
 * Next.js applies an automatic Origin/Host check to Server Actions but NOT
 * to Route Handlers. All of our API is Route Handlers. Supabase SSR sets
 * session cookies with `SameSite=Lax` by default, which blocks the common
 * cross-site POST CSRF cases — but not all of them (top-level navigation
 * trickery + legacy browsers). This helper adds explicit Origin validation
 * on state-changing endpoints as belt-and-suspenders.
 *
 * Apply to: state-changing POST/PATCH/PUT/DELETE Route Handlers that use
 * cookie auth. Do NOT apply to webhook routes (they have HMAC verification
 * and don't receive Origin from server-to-server callers).
 *
 * Allowed origins:
 *   - The request's own origin (req.nextUrl.origin). Same-origin same-tab
 *     fetches always include this; this covers normal app usage.
 *   - PUBLIC_BASE_URL when set (production canonical URL behind a proxy).
 *
 * Strategy:
 *   - If Origin header is missing → allow (some clients omit it; SameSite
 *     cookies still block cross-site).
 *   - If Origin header is present and matches the allowlist → allow.
 *   - Otherwise → 403.
 *
 * Returns a 403 NextResponse on failure, or `null` on pass.
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // server-to-server or fetch without Origin (browser navigations); SameSite covers.

  const allowed = new Set<string>();
  allowed.add(req.nextUrl.origin);
  const publicBase = process.env.PUBLIC_BASE_URL;
  if (publicBase) {
    try {
      allowed.add(new URL(publicBase).origin);
    } catch {
      // ignore malformed PUBLIC_BASE_URL — env validator catches it at boot.
    }
  }

  if (allowed.has(origin)) return null;
  return NextResponse.json(
    { error: "origin_not_allowed", origin },
    { status: 403, headers: { "x-csrf-block": "1" } },
  );
}

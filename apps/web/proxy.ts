import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieToSet } from "@/lib/supabase-server";
import { assertSameOrigin } from "@/lib/assert-same-origin";

/**
 * Auth gate. Three states:
 *
 *  1. Unauthenticated request to a gated path → redirect to /auth/sign-in?next=...
 *  2. Authenticated but not an operator → redirect to /auth/access-pending
 *  3. Authenticated operator → pass through
 *
 * Also refreshes the Supabase session on every request so server components
 * see a fresh `auth.getUser()` (otherwise sessions silently expire after the
 * access-token TTL). See @supabase/ssr docs.
 *
 * Gated paths: /provision, /test/*, /dashboard/*. Public: /, /auth/*, /api/*.
 * /api/* is excluded from the OPERATOR gate (handlers do their own auth —
 * webhooks use HMAC, operator routes use getOperatorOrJsonError, owner routes
 * use resolveOwnerAgent). It IS subject to the CSRF Origin check below.
 */

const GATED_PREFIXES = ["/provision", "/test", "/dashboard"];
const ALLOW_NONOPERATOR_AUTH_PATHS = ["/auth/access-pending", "/auth/sign-out"];

// state-changing methods that must pass the same-origin Origin check.
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// API path prefixes that LEGITIMATELY receive cross-origin POSTs from
// server-to-server (ElevenLabs, Twilio, Vercel cron, etc.). These already do
// their own HMAC / signature verification before any side-effect.
const ORIGIN_CHECK_BYPASS_PREFIXES = ["/api/post-call", "/api/tools/", "/api/twilio/"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defense-in-depth. Block state-changing requests whose Origin
  // header is present and does not match our own origin. Done BEFORE any
  // Supabase session work so the check is cheap. Webhook prefixes bypass
  // because they validate signatures cryptographically.
  if (STATE_CHANGING_METHODS.has(req.method) && pathname.startsWith("/api/")) {
    const bypass = ORIGIN_CHECK_BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
    if (!bypass) {
      const blocked = assertSameOrigin(req);
      if (blocked) return blocked;
    }
  }

  // For /api/* paths, skip the operator-session refresh entirely. Each route
  // handler does its own auth (HMAC for webhooks, getOperatorOrJsonError for
  // operator routes, resolveOwnerAgent for owner routes). Running session
  // refresh here would add ~50ms to every webhook call for no benefit.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  const needsGate = GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const res = NextResponse.next({ request: { headers: req.headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          req.cookies.set(name, value);
          res.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;

  if (!needsGate) return res;

  if (!user) {
    const signIn = req.nextUrl.clone();
    signIn.pathname = "/auth/sign-in";
    signIn.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  if (ALLOW_NONOPERATOR_AUTH_PATHS.includes(pathname)) return res;

  const { data: operatorRow } = await supabase
    .from("operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!operatorRow) {
    const pending = req.nextUrl.clone();
    pending.pathname = "/auth/access-pending";
    pending.search = "";
    return NextResponse.redirect(pending);
  }

  return res;
}

export const config = {
  // Match everything except Next.js internals and static files. /api/* IS
  // matched so the CSRF Origin check can run there; the proxy function
  // short-circuits before the operator-session work for /api/* paths.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)"],
};

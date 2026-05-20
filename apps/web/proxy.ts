import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

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
 * /api/* is excluded so webhooks (post-call, server tools) hit their routes
 * directly; those routes do their own auth (HMAC for webhooks, getOperatorOrJsonError for operator-only routes).
 */

const GATED_PREFIXES = ["/provision", "/test", "/dashboard"];
const ALLOW_NONOPERATOR_AUTH_PATHS = ["/auth/access-pending", "/auth/sign-out"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsGate = GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

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
  // Match everything except:
  //   - Next.js internals (_next/*)
  //   - static files (favicon, images, etc.)
  //   - /api/* (handlers do their own auth — webhooks use HMAC, operator
  //     routes use getOperatorOrJsonError, public probe routes are explicit)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\..*$).*)",
  ],
};

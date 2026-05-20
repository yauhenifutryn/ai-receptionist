import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Magic-link callback. Supabase appends `?code=<pkce-code>&next=<path>` to the
 * redirect URL we configured in `signInWithOtp`. We exchange the code for a
 * session and redirect into /dashboard (or wherever `next` says).
 *
 * Critical detail: we must construct the redirect Response FIRST and bind
 * the supabase cookie adapter to it. If we use the global `cookies()` store
 * (via `getUserSupabase()`), it's discarded when the route returns a
 * NextResponse.redirect — the auth cookies never reach the browser, the
 * session isn't established, and the next request to /dashboard sees no
 * user → middleware bounces back to /auth/sign-in. Documented @supabase/ssr
 * gotcha (https://supabase.com/docs/guides/auth/server-side/nextjs).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = sanitizeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(buildSignInUrl(url.origin, "missing_code"));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(buildSignInUrl(url.origin, "env_missing"));
  }

  const successResponse = NextResponse.redirect(`${url.origin}${next}`);

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          successResponse.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(buildSignInUrl(url.origin, encodeURIComponent(error.message)));
  }

  return successResponse;
}

function sanitizeNext(value: string | null): string {
  // Open-redirect guard: only allow relative paths starting with a single "/".
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function buildSignInUrl(origin: string, errorCode: string): string {
  return `${origin}/auth/sign-in?error=${errorCode}`;
}

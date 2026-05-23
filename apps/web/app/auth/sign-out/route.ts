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
 * Sign-out is POST-ONLY. A GET endpoint here was a critical bug: Next.js
 * <Link> components prefetch their href in the background, so a "Sign out"
 * <Link> on the dashboard would silently call this route the moment the
 * page rendered, killing the user's session before they could even read it.
 * Same risk applies to image preloads, link checkers, CSRF, etc.
 *
 * For prefetch requests (Next.js sends `purpose: prefetch` or
 * `next-router-prefetch: 1` headers) we return 204 No Content without
 * touching the session. Real user sign-outs go through a form POST.
 */

export async function POST(req: NextRequest) {
  return performSignOut(req);
}

export async function GET(req: NextRequest) {
  // Honor sign-out via GET as a fallback (e.g. browser quirks, manual URL
  // entry) but ONLY if the request is not a prefetch. Prefetches get a
  // 204 No Content and the session is left alone.
  if (isPrefetch(req)) {
    return new NextResponse(null, { status: 204 });
  }
  return performSignOut(req);
}

function isPrefetch(req: NextRequest): boolean {
  const purpose = req.headers.get("purpose") ?? req.headers.get("x-purpose");
  if (purpose && purpose.toLowerCase().includes("prefetch")) return true;
  if (req.headers.get("next-router-prefetch") === "1") return true;
  if (req.headers.get("sec-purpose")?.toLowerCase().includes("prefetch")) return true;
  return false;
}

async function performSignOut(req: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Status 303 ("See Other") is the canonical POST-redirect-GET status.
  // Without it, NextResponse.redirect defaults to 307 which PRESERVES the
  // POST method on the redirect target — the browser would then POST to
  // /auth/sign-in (a page route with no POST handler), surfacing a blank
  // screen and the "resubmit form?" popup on reload.
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(`${req.nextUrl.origin}/auth/sign-in`, 303);
  }

  const response = NextResponse.redirect(`${req.nextUrl.origin}/auth/sign-in`, 303);

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  await supabase.auth.signOut();
  return response;
}

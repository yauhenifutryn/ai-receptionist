import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * OTP code verification. The user enters the 6-digit code from the email
 * (the magic-link path's `?code=` flow can't survive Safari's cross-domain
 * redirect heuristics + PKCE verifier cookie loss). The OTP code itself is
 * the credential — no PKCE verifier required, no cookies-in-transit.
 *
 * Flow:
 *   1. Validate body { email, token, next }.
 *   2. Re-check whitelist defense-in-depth.
 *   3. supabase.auth.verifyOtp({ email, token, type: "email" })
 *      sets the session cookies via our setAll adapter onto the JSON response.
 *   4. Browser receives Set-Cookie + { redirectTo }, navigates client-side.
 *
 * verifyOtp bypasses PKCE entirely (no /auth/v1/token PKCE exchange);
 * the OTP token is exchanged directly via /auth/v1/verify.
 */

const BodySchema = z.object({
  email: z.string().email().max(320),
  token: z.string().min(4).max(12),
  next: z.string().min(1).max(200).optional(),
});

function sanitizeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const email = parsed.data.email.trim().toLowerCase();
  // Tolerate "1 2 3 4 5 6" or "123-456" pastings.
  const token = parsed.data.token.replace(/[\s-]/g, "");
  const next = sanitizeNext(parsed.data.next);

  // Defense-in-depth: whitelist still gates here. If somehow the user got
  // an OTP from outside the request-magic-link path, refuse to mint a session.
  const service = getServiceRoleSupabase();
  const { data: allowed, error: lookupErr } = await service
    .from("operator_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: "internal_lookup_failed" }, { status: 500 });
  }
  if (!allowed) {
    return NextResponse.json(
      {
        error: "not_authorized",
        message: "This email isn't on the operator allow-list. Ask the admin to add you.",
      },
      { status: 403 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  }

  // Build response FIRST so setAll can attach session cookies onto it.
  const response = NextResponse.json({ ok: true, redirectTo: next }, { status: 200 });

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          // Force path: "/" so cookies are sent on every route afterward.
          response.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (verifyErr) {
    const status = verifyErr.message.toLowerCase().includes("expired")
      ? 410
      : verifyErr.message.toLowerCase().includes("invalid")
        ? 401
        : 400;
    return NextResponse.json(
      {
        error: "verify_failed",
        message: verifyErr.message,
      },
      { status },
    );
  }

  return response;
}

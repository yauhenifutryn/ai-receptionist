import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { checkRateLimit, callerIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Static-code operator sign-in. Single-tap workaround until a Resend custom
 * domain is verified and operators can receive OTP codes by email like
 * normal users do.
 *
 * Each operator has ONE permanent code stored in env (OPERATOR_CODE_REM,
 * OPERATOR_CODE_SEBASTIAN). Codes map to their fixed email addresses.
 * Submitting a valid code mints a fresh Supabase session for that email
 * and sets the session cookies on our domain — no callback dance, no
 * PKCE, no Safari ITP exposure. The magic-link callback flow that gets
 * minted from `admin-magic-link.mjs` is brittle (depends on /auth/callback
 * receiving a `?code=` it never gets in the implicit-verify flow); this
 * route bypasses it entirely by re-using the same server-side verifyOtp
 * pattern that the regular `/api/auth/verify-otp` route already uses.
 *
 * Delete this route + the OPERATOR_CODE_* env vars once Resend domain is
 * verified and operators use the regular email-OTP path at `/auth/sign-in`.
 */

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

const BodySchema = z.object({
  code: z.string().min(8).max(64),
});

/**
 * Constant-time compare of the submitted code against each known env code.
 * Always iterates the full candidate set so a hit on the first slot doesn't
 * time-leak vs a miss on the second slot. SHA-256 buffers normalise length
 * so timingSafeEqual doesn't bail on the length-mismatch fast path.
 */
function mapCodeToEmail(code: string): string | null {
  const candidates: Array<[string | undefined, string]> = [
    [process.env.OPERATOR_CODE_REM, "grednep@gmail.com"],
    [process.env.OPERATOR_CODE_SEBASTIAN, "wodecki.sg@gmail.com"],
  ];
  const submitted = createHash("sha256").update(code).digest();
  let match: string | null = null;
  for (const [expected, email] of candidates) {
    if (!expected) continue;
    const expectedHash = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(submitted, expectedHash)) {
      match = email;
      // No early return — keep iterating so total time is constant.
    }
  }
  return match;
}

export async function POST(req: NextRequest) {
  // F5/F10: per-IP rate limit caps the cost of a single source spraying codes.
  // TM-002 adds a SECOND per-code bucket below so even a distributed spray
  // from N residential IPs can't multiply the global attempt budget.
  const rl = checkRateLimit({
    key: `auth:operator-code:${callerIp(req)}`,
    maxAttempts: 5,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", message: "Code is required." },
      { status: 400 },
    );
  }
  const code = parsed.data.code.trim();

  // TM-002: global per-code bucket. Keyed by the SHA-256 of the submitted
  // code so an attacker spraying random codes spreads themselves thin across
  // 2^256 buckets and never builds up enough attempts against any one bucket
  // to crack it — while a credible attacker hammering a SHORT list of guessed
  // codes still hits this cap regardless of how many IPs they spread across.
  // Hash-keyed so the in-memory map never stores the raw submitted code.
  const codeBucket = checkRateLimit({
    key: `auth:operator-code:hash:${createHash("sha256").update(code).digest("hex")}`,
    maxAttempts: 10,
    windowSec: 3600,
  });
  if (!codeBucket.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: codeBucket.retryAfterSec },
      { status: 429, headers: { "retry-after": String(codeBucket.retryAfterSec) } },
    );
  }

  const email = mapCodeToEmail(code);
  if (!email) {
    return NextResponse.json(
      { error: "invalid_code", message: "Code not recognised." },
      { status: 401 },
    );
  }

  const service = getServiceRoleSupabase();

  // Mint a fresh email_otp for this operator. admin.generateLink returns
  // the OTP without sending an email; we'll redeem it server-side.
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) {
    return NextResponse.json(
      { error: "otp_mint_failed", message: linkErr.message },
      { status: 502 },
    );
  }
  const otp = linkData?.properties?.email_otp;
  if (!otp) {
    return NextResponse.json(
      { error: "otp_missing", message: "Supabase returned no OTP." },
      { status: 502 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  }

  // Mirror the verify-otp route: a "cookie sink" response receives the
  // Supabase session cookies during verifyOtp, then we transfer them onto
  // the final JSON response with the role-appropriate redirect target.
  const cookieSink = NextResponse.json({ ok: true }, { status: 200 });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          cookieSink.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: "verify_failed", message: verifyErr.message },
      { status: 502 },
    );
  }

  // Operator path: same trigger that promotes a whitelisted email into the
  // `operators` table fires on first auth.users insert (fixed by the
  // 2026-05-21 migration). Either it ran on first sign-in, OR the user
  // already exists. Either way, redirecting to /dashboard surfaces the
  // operator console. The middleware verifies operator status server-side
  // on the next request, so an attacker who somehow stole an op code still
  // can't escalate to a non-operator session.
  void verifyData; // not needed past this point

  const finalResponse = NextResponse.json({ ok: true, redirectTo: "/dashboard" }, { status: 200 });
  for (const cookie of cookieSink.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }
  return finalResponse;
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { materializePendingInvitations } from "@/lib/auth-materialize-invitations";

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
    // Defense-in-depth: owners must have either a pending tenant_invitations
    // row (first-time bootstrap) OR an already-materialized tenant_members
    // row (returning owner whose invitation has been consumed).
    const { data: pendingInvite, error: inviteErr } = await service
      .from("tenant_invitations")
      .select("id")
      .eq("email", email)
      .is("consumed_at", null)
      .maybeSingle();
    if (inviteErr) {
      return NextResponse.json({ error: "internal_lookup_failed" }, { status: 500 });
    }
    let hasMembership = false;
    if (!pendingInvite) {
      const { data: rpcData, error: rpcErr } = await service.rpc(
        "is_active_tenant_member",
        { p_email: email },
      );
      if (rpcErr) {
        return NextResponse.json({ error: "internal_lookup_failed" }, { status: 500 });
      }
      hasMembership = rpcData === true;
    }
    if (!pendingInvite && !hasMembership) {
      return NextResponse.json(
        {
          error: "not_authorized",
          message: "This email isn't on the allow-list or invited. Ask the admin.",
        },
        { status: 403 },
      );
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  }

  // Build a "cookie sink" response FIRST so the supabase cookie adapter can
  // attach session cookies during verifyOtp. The final JSON body (with the
  // role-appropriate redirectTo) is constructed at the end and the cookies
  // are transferred onto it. We can't mutate the body of an already-created
  // NextResponse, so this two-step dance is required.
  const cookieSink = NextResponse.json({ ok: true }, { status: 200 });

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          // Force path: "/" so cookies are sent on every route afterward.
          cookieSink.cookies.set(name, value, { ...options, path: "/" });
        }
      },
    },
  });

  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
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

  // Materialize any pending owner invitations into tenant_members on first
  // sign-in. Shared helper — same logic runs in /auth/callback for the
  // magic-link path. Best-effort: a failure here shouldn't block sign-in.
  const verifiedEmail = verifyData?.user?.email?.toLowerCase() ?? email;
  const verifiedUid = verifyData?.user?.id;
  if (verifiedUid && verifiedEmail) {
    await materializePendingInvitations(service, verifiedEmail, verifiedUid);
  }

  // Role-based redirect:
  //   - operator (operator_emails) → next (defaults to /dashboard)
  //   - tenant_member → /owner/conversations
  //   - neither → /auth/access-pending
  // Operator check runs against the original email; invitation materialization
  // above may have created a tenant_members row that we read here.
  let redirectTo: string;
  const { data: operatorRow } = await service
    .from("operator_emails")
    .select("email")
    .eq("email", verifiedEmail)
    .maybeSingle();
  if (operatorRow) {
    redirectTo = next;
  } else if (verifiedUid) {
    const { data: membership } = await service
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", verifiedUid)
      .limit(1)
      .maybeSingle();
    redirectTo = membership ? "/owner/conversations" : "/auth/access-pending";
  } else {
    redirectTo = "/auth/access-pending";
  }

  // Build the final JSON response, then port the session cookies that the
  // supabase adapter attached to cookieSink during verifyOtp.
  const finalResponse = NextResponse.json(
    { ok: true, redirectTo },
    { status: 200 },
  );
  for (const cookie of cookieSink.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }
  return finalResponse;
}

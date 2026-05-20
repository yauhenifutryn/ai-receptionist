import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator-only sign-in. Sends a 6-digit code (NOT a magic link) to the
 * operator's email and stores it in Supabase Auth's pending-OTP state.
 * The user types the code into the form and we verify it via verifyOtp.
 *
 * The previous PKCE+magic-link flow died on Safari ITP — the PKCE verifier
 * cookie didn't survive the Supabase → app redirect chain, so the callback
 * couldn't redeem the code. The OTP-code path skips that entire round-trip:
 * the code IS the credential, no cross-domain cookie state to lose.
 *
 * Flow:
 *   1. Validate body { email, next }.
 *   2. Service-role lookup against operator_emails. Not on allow-list → 403.
 *   3. `supabase.auth.admin.generateLink({ type: "magiclink", email })`
 *      mints a pending OTP server-side. The response includes `email_otp`
 *      (the 6-digit code). NO EMAIL IS SENT BY SUPABASE — this method is
 *      purely "give me the credential, I'll deliver it myself."
 *   4. We send the email via Resend API directly with our own template,
 *      so it contains ONLY the code (no link, no "Sign in" button).
 *   5. User types the code into the form; /api/auth/verify-otp redeems it
 *      via supabase.auth.verifyOtp(..., type: "email").
 */

const BodySchema = z.object({
  email: z.string().email().max(320),
  next: z.string().min(1).max(200).optional(),
});

interface ResendErrorBody {
  name?: string;
  message?: string;
  statusCode?: number;
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

  // 1. Whitelist check.
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
    // Owners get in via a pending tenant_invitations row, not the operator
    // allow-list. Materialization into tenant_members happens in verify-otp.
    const { data: pendingInvite, error: inviteErr } = await service
      .from("tenant_invitations")
      .select("id")
      .eq("email", email)
      .is("consumed_at", null)
      .maybeSingle();
    if (inviteErr) {
      return NextResponse.json({ error: "internal_lookup_failed" }, { status: 500 });
    }
    if (!pendingInvite) {
      return NextResponse.json(
        {
          error: "not_authorized",
          message: "This email isn't on the allow-list or invited. Ask the admin.",
        },
        { status: 403 },
      );
    }
  }

  // 2. Mint the OTP server-side (no email sent yet).
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) {
    return NextResponse.json(
      { error: "otp_generate_failed", message: linkErr.message },
      { status: 502 },
    );
  }
  const otp = linkData?.properties?.email_otp;
  if (!otp) {
    return NextResponse.json({ error: "otp_missing_from_response" }, { status: 502 });
  }

  // 3. Send via Resend API directly. Our own template, our own copy.
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "resend_key_missing" }, { status: 500 });
  }
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "AI Receptionist <onboarding@resend.dev>",
      to: email,
      subject: "Your AI Receptionist sign-in code",
      html: buildEmailHtml(otp),
    }),
  });
  if (!resendRes.ok) {
    const errBody = (await resendRes.json().catch(() => ({}))) as ResendErrorBody;
    return NextResponse.json(
      {
        error: "email_send_failed",
        status: resendRes.status,
        message: errBody.message ?? "Resend rejected the send",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: `Code sent to ${email}.` }, { status: 200 });
}

function buildEmailHtml(otp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Your AI Receptionist sign-in code</title></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
<div style="max-width:480px;margin:40px auto;padding:32px 24px;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;">
  <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#737373;">AI Receptionist &middot; operator sign-in</p>
  <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;letter-spacing:-.01em;color:#0a0a0a;">Your one-time sign-in code</h1>
  <p style="margin:0 0 24px 0;font-size:14px;line-height:1.55;color:#404040;">Paste this code into the sign-in form. It expires in one hour and can only be used once.</p>
  <div style="margin:0 0 28px 0;padding:20px 24px;background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;text-align:center;">
    <p style="margin:0;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:.4em;color:#0a0a0a;">${otp}</p>
  </div>
  <p style="margin:0 0 4px 0;font-size:12px;line-height:1.55;color:#737373;">If you didn't request this, you can safely ignore this email.</p>
</div>
</body>
</html>`;
}

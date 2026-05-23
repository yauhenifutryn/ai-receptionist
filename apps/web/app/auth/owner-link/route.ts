import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/owner-link?token=<uuid>
 *
 * Click-target for the long-TTL outer token minted by
 * /api/agents/[id]/owner-signin-link. Validates the token, marks it
 * consumed, mints a fresh Supabase action_link (1h TTL), and 302s.
 * The action_link itself runs through /auth/callback which sets session
 * cookies and lands the user on /owner/conversations.
 *
 * Failure modes — render a plain-text response (no JSON) since this is
 * a click target, not an API endpoint. The prospect should see something
 * that explains what to do next.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return signinErrorResponse(
      "Missing token. The sign-in URL is incomplete — ask the operator to send a new one.",
      400,
    );
  }

  const service = getServiceRoleSupabase();

  const { data: invite, error: lookupErr } = await service
    .from("tenant_invitations")
    .select("email, signin_token_expires_at, signin_token_consumed_at")
    .eq("signin_token", token)
    .maybeSingle();
  if (lookupErr) {
    return signinErrorResponse(
      "Sign-in service is temporarily unavailable. Try again shortly.",
      500,
    );
  }
  if (!invite) {
    return signinErrorResponse(
      "This sign-in link is no longer valid. Ask the operator to generate a new one.",
      404,
    );
  }
  if (invite.signin_token_consumed_at) {
    return signinErrorResponse(
      "This sign-in link has already been used. Ask the operator to generate a new one.",
      410,
    );
  }
  if (
    invite.signin_token_expires_at &&
    new Date(invite.signin_token_expires_at).getTime() < Date.now()
  ) {
    return signinErrorResponse(
      "This sign-in link has expired. Ask the operator to generate a new one.",
      410,
    );
  }

  // Mint a fresh short-lived Supabase action_link at click time.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const redirectTo = `${siteUrl}/owner/conversations`;

  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: invite.email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return signinErrorResponse(
      "Sign-in service rejected the request. Ask the operator to generate a new link.",
      502,
    );
  }

  // Mark consumed BEFORE redirecting so a duplicate click can't replay.
  await service
    .from("tenant_invitations")
    .update({ signin_token_consumed_at: new Date().toISOString() })
    .eq("signin_token", token);

  return NextResponse.redirect(linkData.properties.action_link, { status: 302 });
}

function signinErrorResponse(message: string, status: number): Response {
  // Minimal HTML so the prospect sees a friendly explanation rather than
  // raw JSON. No external CSS / fonts — has to render even on offline
  // mobile devices.
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Sign-in unavailable</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; color: #1f2937; }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  p { line-height: 1.6; color: #4b5563; }
</style></head>
<body>
  <h1>Sign-in unavailable</h1>
  <p>${escapeHtml(message)}</p>
</body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseBookingsRepository,
  handleCreateBooking,
} from "@ai-receptionist/backend/tools";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // F1: Verify before any DB write. Bookings write tenant_id + PII;
  // an unverified caller could forge bookings against any agent.
  const verified = await verifyElevenLabsWebhook(req);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "webhook_unverified", reason: verified.reason },
      { status: verified.status },
    );
  }
  let body: { conversationId?: unknown } | null = null;
  try {
    body = JSON.parse(verified.rawBody);
  } catch {
    body = null;
  }
  if (!body) {
    return NextResponse.json(
      { code: "validation_failed", callerSafeMessage: "Nie udało mi się odczytać żądania." },
      { status: 400 },
    );
  }
  const repo = createSupabaseBookingsRepository(getServiceRoleSupabase());
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : undefined;
  const result = await handleCreateBooking(body, {
    repo,
    smsShortUrlBase: req.nextUrl.origin,
    ...(conversationId ? { conversationId } : {}),
  });
  if (result.ok) {
    return NextResponse.json(result.response, { status: 200 });
  }
  return NextResponse.json(result.error, { status: result.status });
}

import { NextResponse, type NextRequest } from "next/server";
import { handleCreateBooking } from "@ai-receptionist/backend/tools";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";
import { getBookingDeps } from "@/lib/booking-deps";

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
  let body: { agentId?: unknown; conversationId?: unknown } | null = null;
  try {
    body = JSON.parse(verified.rawBody);
  } catch {
    body = null;
  }
  if (!body || typeof body.agentId !== "string") {
    return NextResponse.json(
      { code: "validation_failed", callerSafeMessage: "Nie udało mi się odczytać żądania." },
      { status: 400 },
    );
  }
  const deps = getBookingDeps();
  const cfg = await deps.resolveTenantConfig(body.agentId);
  if (!cfg) {
    return NextResponse.json(
      {
        code: "tenant_not_found",
        callerSafeMessage: "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
      },
      { status: 404 },
    );
  }
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const result = await handleCreateBooking(body, {
    provider: deps.provider,
    repo: deps.repo,
    smsShortUrlBase: req.nextUrl.origin,
    ...(deps.smsClient ? { smsClient: deps.smsClient } : {}),
    smsFailureLogger: deps.smsFailureLogger,
    clinicName: cfg.clinicName,
    contactPhone: cfg.contactPhone,
    ...(conversationId ? { conversationId } : {}),
  });
  if (result.ok) {
    return NextResponse.json(result.response, { status: 200 });
  }
  return NextResponse.json(result.error, { status: result.status });
}

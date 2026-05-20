import { NextResponse, type NextRequest } from "next/server";
import { handleCheckAvailability } from "@ai-receptionist/backend/tools";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";
import { getBookingDeps } from "@/lib/booking-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // F1: Webhook signature verification before processing — without
  // this anyone who knew the URL + an agentId could spam our backend.
  const verified = await verifyElevenLabsWebhook(req);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "webhook_unverified", reason: verified.reason },
      { status: verified.status },
    );
  }
  let body: { agentId?: unknown } | null = null;
  try {
    body = JSON.parse(verified.rawBody);
  } catch {
    body = null;
  }
  if (!body || typeof body.agentId !== "string") {
    return NextResponse.json(
      {
        code: "validation_failed",
        callerSafeMessage:
          "Nie mogę teraz sprawdzić wolnych terminów. Łączę z kimś z zespołu.",
      },
      { status: 400 },
    );
  }
  const deps = getBookingDeps();
  const cfg = await deps.resolveTenantConfig(body.agentId);
  if (!cfg) {
    return NextResponse.json(
      {
        code: "tenant_not_found",
        callerSafeMessage:
          "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
      },
      { status: 404 },
    );
  }
  try {
    const result = await handleCheckAvailability(body, {
      provider: deps.provider,
      tenantId: cfg.tenantId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        code: "validation_failed",
        callerSafeMessage:
          "Nie mogę teraz sprawdzić wolnych terminów. Łączę z kimś z zespołu.",
      },
      { status: 400 },
    );
  }
}

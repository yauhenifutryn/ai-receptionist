import { NextResponse, type NextRequest } from "next/server";
import { handleDispatchJob } from "@ai-receptionist/backend/tools";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";
import { getBookingDeps } from "@/lib/booking-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emergency dispatch server tool. The agent calls this during an emergency call
 * with the captured job; we SMS it to the tradesman's number (the tenant
 * contact phone) via the existing Zadarma path. Mirrors create-booking's
 * HMAC-verified, tenant-resolved shape.
 */
export async function POST(req: NextRequest) {
  const verified = await verifyElevenLabsWebhook(req);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "webhook_unverified", reason: verified.reason },
      { status: verified.status },
    );
  }
  let body: {
    agentId?: unknown;
    problem?: unknown;
    address?: unknown;
    urgency?: unknown;
    callbackPhone?: unknown;
  } | null = null;
  try {
    body = JSON.parse(verified.rawBody);
  } catch {
    body = null;
  }
  if (!body || typeof body.agentId !== "string") {
    return NextResponse.json(
      { code: "validation_failed", callerSafeMessage: "Nie udalo mi sie odczytac zadania." },
      { status: 400 },
    );
  }
  const deps = getBookingDeps();
  const cfg = await deps.resolveTenantConfig(body.agentId);
  if (!cfg) {
    return NextResponse.json(
      {
        code: "tenant_not_found",
        callerSafeMessage: "Wystapil problem techniczny po naszej stronie.",
      },
      { status: 404 },
    );
  }
  const result = await handleDispatchJob(body, {
    ...(deps.smsClient ? { smsClient: deps.smsClient } : {}),
    dispatchPhone: cfg.contactPhone,
    businessName: cfg.clinicName,
    ...(cfg.tenantId ? { tenantId: cfg.tenantId } : {}),
    smsFailureLogger: {
      async logFailure(input) {
        console.error("[dispatch_sms_failed]", input.errorCode, input.errorMessage);
      },
    },
  });
  if (result.ok) {
    return NextResponse.json(result.response, { status: 200 });
  }
  return NextResponse.json(result.error, { status: result.status });
}

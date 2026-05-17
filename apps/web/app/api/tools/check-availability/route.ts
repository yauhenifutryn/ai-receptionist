import { NextResponse, type NextRequest } from "next/server";
import { handleCheckAvailability } from "@ai-receptionist/backend/tools";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";

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
  try {
    const body = JSON.parse(verified.rawBody);
    const result = handleCheckAvailability(body);
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

import { NextResponse, type NextRequest } from "next/server";
import {
  adaptElevenLabsPostCall,
  createSupabasePostCallRepository,
  handlePostCall,
} from "@ai-receptionist/backend/post-call";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { verifyElevenLabsWebhook } from "@/lib/verify-webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // HMAC verify before any state-changing work. Forged payloads
  // would otherwise flip consent flags / transcript storage / recovered-
  // revenue counters with only an agentId guess.
  const verified = await verifyElevenLabsWebhook(req);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "webhook_unverified", reason: verified.reason },
      { status: verified.status },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(verified.rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body == null) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // EL sends { type: "post_call_transcription", data: {…} } (snake_case);
  // adapt to the internal contract. Non-EL bodies (tests, internal senders)
  // pass through and validate against the schema as before.
  const adapted = adaptElevenLabsPostCall(body);
  const repo = createSupabasePostCallRepository(getServiceRoleSupabase());
  const result = await handlePostCall(adapted ?? body, { repo });
  if (result.ok) {
    return NextResponse.json(
      {
        tenantId: result.tenantId,
        consentLogged: result.consentLogged,
        transcriptStored: result.transcriptStored,
        recoveredRevenuePln: result.recoveredRevenuePln,
      },
      { status: 200 },
    );
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}

import { NextResponse, type NextRequest } from "next/server";
import { ElevenLabsConvAIProvider } from "@ai-receptionist/backend/orchestration";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * Sync the check_availability + create_booking tools onto an existing
 * ElevenLabs agent. Used to retrofit agents provisioned BEFORE the Chat B
 * tools block was uncommented — no full re-provision needed.
 *
 * Operator-only. Idempotent on EL side (PATCH overwrites the tools array).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  const provider = new ElevenLabsConvAIProvider({ apiKey });

  // Server-tool base URL is the current origin's /api path (where our tool
  // routes live). Matches what provision/route.ts uses when creating new
  // agents, so synced agents call the same endpoints.
  const origin = req.nextUrl.origin;
  const serverToolBaseUrl = `${origin}/api`;

  try {
    await provider.updateAgentTools({
      agentId: providerAgentId,
      serverToolBaseUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "sync_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

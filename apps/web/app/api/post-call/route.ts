import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabasePostCallRepository,
  handlePostCall,
} from "@ai-receptionist/backend/post-call";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body == null) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const repo = createSupabasePostCallRepository(getServiceRoleSupabase());
  const result = await handlePostCall(body, { repo });
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

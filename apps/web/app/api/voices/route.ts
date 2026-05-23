import { NextResponse } from "next/server";
import { getOperatorOrJsonError } from "@/lib/supabase-server";
import { listCuratedElevenLabsVoices } from "@/lib/elevenlabs-voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  return listCuratedElevenLabsVoices(apiKey);
}

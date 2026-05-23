import { NextResponse } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";
import { listCuratedElevenLabsVoices } from "@/lib/elevenlabs-voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-facing curated voice list. Same filtering + sorting as /api/voices.
 * Gated on tenant_members (any role) rather than operators.
 */
export async function GET() {
  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "no_tenant_membership" }, { status: 403 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  return listCuratedElevenLabsVoices(apiKey);
}

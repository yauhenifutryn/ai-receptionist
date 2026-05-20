import { NextResponse } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";
import { DEFAULT_VOICE_ID } from "@ai-receptionist/backend/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawVoice {
  voice_id?: string;
  name?: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
  description?: string | null;
  verified_languages?: Array<{ language?: string; model_id?: string }>;
}

/**
 * Owner-facing curated voice list. Same filtering + sorting as the
 * operator route at /api/voices — read-only and identical for every
 * tenant, so the only thing that changes between roles is auth.
 *
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

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "elevenlabs_voices_failed", status: res.status, body: text.slice(0, 400) },
      { status: 502 },
    );
  }
  const data = (await res.json()) as { voices?: RawVoice[] };

  const filtered = (data.voices ?? []).filter(
    (v) => v.category === "premade" || v.category === "professional",
  );

  const mapped = filtered.map((v) => {
    const verifiedLanguages = (v.verified_languages ?? [])
      .map((l) => l.language)
      .filter((l): l is string => typeof l === "string");
    const polishVerified = verifiedLanguages.some(
      (l) => l.toLowerCase() === "pl" || l.toLowerCase() === "polish",
    );
    return {
      id: v.voice_id ?? "",
      name: v.name ?? "—",
      category: v.category ?? null,
      accent: v.labels?.accent ?? null,
      gender: v.labels?.gender ?? null,
      age: v.labels?.age ?? null,
      useCase: v.labels?.use_case ?? v.labels?.["use case"] ?? null,
      description: v.description ?? null,
      previewUrl: v.preview_url ?? null,
      verifiedLanguages,
      polishVerified,
      isDefault: v.voice_id === DEFAULT_VOICE_ID,
    };
  });

  mapped.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    if (a.polishVerified && !b.polishVerified) return -1;
    if (b.polishVerified && !a.polishVerified) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ voices: mapped });
}

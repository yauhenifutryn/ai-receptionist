import { NextResponse } from "next/server";
import { getOperatorOrJsonError } from "@/lib/supabase-server";
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
 * List voices from the ElevenLabs workspace, filtered to the set that's
 * safe for clients to pick. Operator-only.
 *
 * Filter rules:
 *   - Only `premade` and `professional` categories. These are EL's vetted
 *     voices. Skips `cloned` / `generated` voices in the workspace which
 *     are usually internal experiments not meant for client exposure.
 *   - Sort: our verified-Polish default voice first, then alphabetic by
 *     name. Ensures the safe-by-default voice is the topmost dropdown
 *     option in the agent-settings panel.
 *
 * IMPORTANT context for clients: every voice returned by this endpoint
 * CAN speak Polish via the multilingual TTS model `eleven_flash_v2_5`
 * (locked in elevenlabs-convai.ts). Quality varies — an "American
 * accent"-labelled voice will sound foreign-accented in Polish. The
 * default voice (mr1ubFaLs5xVrh1EqWtc) was hand-picked for Polish
 * native-sounding output.
 */
export async function GET() {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "elevenlabs_api_key_missing" },
      { status: 500 },
    );
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

  // Default voice first, Polish-verified next, then alphabetic.
  mapped.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    if (a.polishVerified && !b.polishVerified) return -1;
    if (b.polishVerified && !a.polishVerified) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ voices: mapped });
}

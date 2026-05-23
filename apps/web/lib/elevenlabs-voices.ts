import { NextResponse } from "next/server";
import { DEFAULT_VOICE_ID } from "@ai-receptionist/backend/orchestration";

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
 * Fetch + filter + sort the ElevenLabs workspace voices into the curated
 * list both /api/voices (operator) and /api/owner/voices (tenant member)
 * expose. Filter rules and sort order are identical for both audiences —
 * only the auth gate differs, so it stays in the callers.
 *
 * IMPORTANT context: every returned voice can speak Polish via the
 * multilingual TTS model `eleven_flash_v2_5` (locked in elevenlabs-convai.ts).
 * Quality varies — an "American accent"-labelled voice will sound
 * foreign-accented in Polish. The default voice (mr1ubFaLs5xVrh1EqWtc) was
 * hand-picked for Polish native-sounding output and surfaces first in the
 * dropdown.
 */
export async function listCuratedElevenLabsVoices(apiKey: string): Promise<NextResponse> {
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

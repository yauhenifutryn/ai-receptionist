// apps/backend/scripts/generate-ivr-prompts.mjs
// One-off: generate the demo-line IVR prompts with the same EL voice the
// agents use, so the IVR sounds like the product. Bilingual PL→EN.
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/generate-ivr-prompts.mjs
import { writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Missing ELEVENLABS_API_KEY");
const VOICE_ID = "mr1ubFaLs5xVrh1EqWtc"; // DEFAULT_VOICE_ID from elevenlabs-convai.ts
const OUT = "apps/web/public/ivr";

const PROMPTS = {
  "pin-prompt.mp3":
    "Witamy w demonstracji recepcjonistki A I. Wprowadź sześciocyfrowy kod dostępu na klawiaturze telefonu. ... Welcome to the A I receptionist demo. Please enter your six digit access code on the keypad.",
  "pin-invalid.mp3":
    "Kod nieprawidłowy. Spróbuj ponownie. ... That code was not recognized. Please try again.",
  "goodbye.mp3":
    "Nie udało się zweryfikować kodu. Sprawdź kod w wiadomości e-mail i zadzwoń ponownie. Do usłyszenia! ... We could not verify your code. Please check your e-mail and call again. Goodbye!",
};

await mkdir(OUT, { recursive: true });
for (const [file, text] of Object.entries(PROMPTS)) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!r.ok) throw new Error(`TTS ${file} → ${r.status} ${await r.text().catch(() => "")}`);
  await writeFile(`${OUT}/${file}`, Buffer.from(await r.arrayBuffer()));
  console.log(`wrote ${OUT}/${file}`);
}

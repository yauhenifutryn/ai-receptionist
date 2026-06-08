// apps/backend/scripts/generate-ivr-prompts.mjs
// One-off: generate the demo-line IVR prompts with the same EL voice the
// agents use, so the IVR sounds like the product. Bilingual PL→EN.
// Run: set -a; . ./.env.local; set +a; node apps/backend/scripts/generate-ivr-prompts.mjs
// Idempotent: files that already exist are skipped (EL TTS is not
// deterministic, so re-running must not churn the committed prompts). Pass
// --force to regenerate everything.
import { writeFile, mkdir, access } from "node:fs/promises";

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
  "limit-reached.mp3":
    "Ten kod demonstracyjny wykorzystał już swój limit czasu. Aby kontynuować testy, skontaktuj się z nami. Dziękujemy i do usłyszenia! ... This demo code has used up its time limit. Please get in touch with us to keep testing. Thank you and goodbye!",
};

const force = process.argv.includes("--force");
await mkdir(OUT, { recursive: true });
for (const [file, text] of Object.entries(PROMPTS)) {
  if (!force) {
    const exists = await access(`${OUT}/${file}`).then(
      () => true,
      () => false,
    );
    if (exists) {
      console.log(`skip ${OUT}/${file} (exists)`);
      continue;
    }
  }
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

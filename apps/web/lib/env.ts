import { z } from "zod";

// Single source of truth for required envs in the web tier.
// Routes call `getEnv()` lazily; the schema fails fast with a list of
// all missing keys (not just the first). Mirrors `.env.example`.
//
// Tier semantics:
//   - SECRET keys (no NEXT_PUBLIC_ prefix): server-only.
//   - PUBLIC keys (NEXT_PUBLIC_ prefix): bundled into the browser. Never
//     put secrets behind this prefix.
//
// Mark a key `.optional()` only when the route guards on undefined.
// Required keys throw at first access.

const envSchema = z.object({
  // LLM providers — primary path is Gemini for backend work, Anthropic for
  // ConvAI runtime, OpenAI optional benchmark.
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY missing — primary LLM key"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Voice runtime — ElevenLabs.
  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY missing — required for agents"),
  ELEVENLABS_VOICE_ID: z.string().min(1).default("mr1ubFaLs5xVrh1EqWtc"),
  // Optional in dev (verifier degrades to warn-and-accept), REQUIRED in
  // production (verifier hard-fails). Schema reflects that with .optional()
  // and the runtime check lives in lib/verify-webhook-signature.ts.
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),

  // Scraper.
  FIRECRAWL_API_KEY: z.string().min(1, "FIRECRAWL_API_KEY missing — required for clinic scrape"),

  // Supabase (EU, Ireland eu-west-1).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY missing"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY missing — required for server inserts"),

  // Telephony + SMS — wave-2 features. Optional until the route needs them.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  SMSAPI_TOKEN: z.string().optional(),

  // App config — fallback origin used for ElevenLabs webhook URLs in prod.
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Standard.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Vercel platform-set. "production" on prod deployments, "preview" on PR
  // previews, "development" on local. Independent of NODE_ENV; used by F9
  // checks (webhook-secret presence) and other prod-only assertions.
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      [
        "Environment validation failed (web tier):",
        ...issues,
        "Check .env.local against .env.example.",
      ].join("\n"),
    );
  }
  // production hard-requires ELEVENLABS_WEBHOOK_SECRET. Without it the
  // signature verifier degrades to warn-and-accept, which lets attackers
  // forge consent flags and bookings via /api/post-call + /api/tools/*.
  if (parsed.data.VERCEL_ENV === "production" && !parsed.data.ELEVENLABS_WEBHOOK_SECRET) {
    throw new Error(
      "ELEVENLABS_WEBHOOK_SECRET is required when VERCEL_ENV=production. " +
        "Set it in Vercel project settings → Environment Variables.",
    );
  }
  cached = parsed.data;
  return cached;
}

// For tests only — reset the cache between cases.
export function __resetEnvCacheForTests(): void {
  cached = null;
}

import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";
import { checkRateLimit, callerIp, rateLimitedResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append a per-test-session transcript so demo runs are persisted for later
 * replay. ElevenLabs' post-call webhook captures the FINAL transcript for
 * real calls, but THIS endpoint persists the live in-progress view of
 * browser-test sessions (mic/chat on /test/[agentId]).
 *
 * Storage:
 *   - Primary: Supabase `test_transcripts` table (operator-only RLS read).
 *     Survives across devices + Vercel's read-only build artifacts. Queryable
 *     for cold-email analysis ("what objections did clinic X raise?").
 *   - Secondary (dev only): test-sessions/<agentId>/transcripts/<convId>.jsonl
 *     on the local FS. Useful for fast grep during dev. Skipped on Vercel
 *     where cwd is read-only.
 */
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,160}$/;
const TURN_LIMIT = 2000;

const BodySchema = z.object({
  agentId: z.string().regex(SAFE_ID_RE),
  conversationId: z.string().regex(SAFE_ID_RE),
  role: z.enum(["user", "agent"]),
  text: z.string().min(1).max(8000),
  timestamp: z.number().int().positive(),
  source: z.enum(["voice", "chat"]).optional(),
  // surface is now REQUIRED so the route can pick the right auth path
  // (PIN check for pin_demo, operator session for browser_test).
  surface: z.enum(["browser_test", "pin_demo"]),
  // Required only when surface === "pin_demo". Validated against
  // agents.pin_code below. Demo client passes this; operator client doesn't.
  pin: z
    .string()
    .regex(/^\d{4,6}$/)
    .optional(),
});

function repoRoot(): string {
  // app dir → apps/web → up two levels to repo root.
  return path.resolve(process.cwd(), "../..");
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  // rate limit (agentId, conversationId, IP) to bound transcript spam
  // even from valid PIN holders. 60 inserts per minute is generous (a fast
  // mic conversation emits ~10/min); blocks the obvious abuse case.
  const rl = checkRateLimit({
    key: `transcript:${b.agentId}:${b.conversationId}:${callerIp(req)}`,
    maxAttempts: 60,
    windowSec: 60,
  });
  if (!rl.allowed) return rateLimitedResponse(rl);

  // auth gate. Route handles two contexts:
  //   - pin_demo: caller must supply matching PIN for the agent.
  //   - browser_test: caller must be an authenticated operator.
  const service = getServiceRoleSupabase();
  if (b.surface === "pin_demo") {
    if (!b.pin) {
      return NextResponse.json({ error: "pin_required" }, { status: 401 });
    }
    const { data: agentRow } = await service
      .from("agents")
      .select("pin_code")
      .eq("provider_agent_id", b.agentId)
      .maybeSingle();
    if (!agentRow || agentRow.pin_code !== b.pin) {
      return NextResponse.json({ error: "pin_mismatch" }, { status: 403 });
    }
  } else {
    // browser_test → operator session required.
    const userSupabase = await getUserSupabase();
    const { data: userData } = await userSupabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { data: op } = await service
      .from("operator_emails")
      .select("email")
      .eq("email", userData.user.email)
      .maybeSingle();
    if (!op) {
      return NextResponse.json({ error: "not_an_operator" }, { status: 403 });
    }
  }

  // 1. Supabase insert — primary, durable, queryable.
  let supabaseOk = false;
  let supabaseError: string | undefined;
  try {
    const { error: dbErr } = await service.from("test_transcripts").insert({
      provider_agent_id: b.agentId,
      conversation_id: b.conversationId,
      role: b.role,
      text: b.text,
      source: b.source ?? null,
      surface: b.surface ?? null,
      recorded_at: new Date(b.timestamp).toISOString(),
    });
    if (dbErr) {
      supabaseError = dbErr.message;
    } else {
      supabaseOk = true;
    }
  } catch (e) {
    supabaseError = (e as Error).message;
  }

  // 2. Local FS append — secondary, best-effort, dev-only convenience.
  // On Vercel the deployment artifact dir is read-only so the mkdir/append
  // throws — we swallow the error since Supabase is the source of truth.
  let fsOk = false;
  let fsFile: string | undefined;
  const dir = path.join(repoRoot(), "test-sessions", b.agentId, "transcripts");
  const file = path.join(dir, `${b.conversationId}.jsonl`);
  const resolved = path.resolve(file);
  const root = path.resolve(repoRoot(), "test-sessions");
  if (resolved.startsWith(root)) {
    try {
      await fs.mkdir(dir, { recursive: true });
      let lines = 0;
      try {
        const existing = await fs.readFile(file, "utf-8");
        lines = existing.split("\n").filter(Boolean).length;
      } catch {
        // file doesn't exist yet — fine
      }
      if (lines < TURN_LIMIT) {
        const record = JSON.stringify({
          t: new Date(b.timestamp).toISOString(),
          role: b.role,
          text: b.text,
          ...(b.source ? { source: b.source } : {}),
        });
        await fs.appendFile(file, record + "\n", "utf-8");
        fsOk = true;
        fsFile = file;
      }
    } catch {
      // EROFS, EACCES, EPERM on production Vercel — Supabase is authoritative.
    }
  }

  if (!supabaseOk && !fsOk) {
    return NextResponse.json({ error: "persist_failed", supabaseError }, { status: 500 });
  }
  return NextResponse.json({ ok: true, supabase: supabaseOk, file: fsFile }, { status: 200 });
}

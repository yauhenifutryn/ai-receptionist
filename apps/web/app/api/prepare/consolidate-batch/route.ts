import { type NextRequest } from "next/server";
import { z } from "zod";
import { consolidate, type FirecrawlPage } from "@ai-receptionist/backend/scraper";
import { LLMClient } from "@ai-receptionist/backend/lib/llm";
import { createGeminiProvider } from "@ai-receptionist/backend/lib/gemini-provider";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PageSchema = z.object({
  url: z.string().url(),
  markdown: z.string(),
});

const BodySchema = z.object({
  rootUrl: z.string().url(),
  pages: z.array(PageSchema).min(1).max(15),
});

export async function POST(req: NextRequest) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return Response.json({ error: operator.body.error }, { status: operator.status });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { rootUrl, pages } = parsed.data;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return Response.json({ error: "gemini_api_key_missing" }, { status: 500 });
  }

  const llm = new LLMClient(createGeminiProvider({ apiKey: geminiKey }), {
    defaultMaxRetries: 1,
  });

  const startedAt = Date.now();
  // Soft deadline below the lambda's 300s ceiling. If consolidate hangs
  // (Gemini 3-flash-preview occasionally stalls past 300s on heavy
  // batches, and 2.5-flash falls into Polish repetition loops emitting
  // 200K+ chars of duplicate service names), we return a clean 500
  // before the gateway returns 504. The client's resilient pipeline
  // treats either as a dropped batch and merges what succeeded.
  const SOFT_TIMEOUT_MS = 270_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SOFT_TIMEOUT_MS);
  try {
    const partial = await consolidate({
      rootUrl,
      pages: pages as FirecrawlPage[],
      llm,
      signal: ac.signal,
    });
    return Response.json({
      partial,
      pagesIn: pages.length,
      geminiMs: Date.now() - startedAt,
    });
  } catch (e) {
    const message = (e as Error).message;
    const timedOut = ac.signal.aborted;
    return Response.json(
      {
        error: timedOut ? "batch_timeout" : "consolidate_failed",
        message: timedOut ? `Batch exceeded ${SOFT_TIMEOUT_MS / 1000}s deadline` : message,
        geminiMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}

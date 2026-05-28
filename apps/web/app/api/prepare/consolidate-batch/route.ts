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
  try {
    const partial = await consolidate({
      rootUrl,
      pages: pages as FirecrawlPage[],
      llm,
    });
    return Response.json({
      partial,
      pagesIn: pages.length,
      geminiMs: Date.now() - startedAt,
    });
  } catch (e) {
    const message = (e as Error).message;
    return Response.json(
      { error: "consolidate_failed", message, geminiMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}

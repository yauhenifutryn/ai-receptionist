import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError } from "@/lib/supabase-server";
import { fetchKbContent, replaceKbDocument } from "@/lib/elevenlabs-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * Operator-scoped KB read/write. The EL-side logic lives in
 * @/lib/elevenlabs-kb so it stays in sync with the owner sibling at
 * /api/owner/kb.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  return fetchKbContent(providerAgentId, apiKey);
}

const PutSchema = z.object({
  markdown: z.string().min(20).max(200_000),
  documentName: z.string().min(2).max(200),
});

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  return replaceKbDocument(providerAgentId, apiKey, parsed.data.markdown, parsed.data.documentName);
}

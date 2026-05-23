import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveOwnerAgent } from "@/lib/owner-agent-context";
import { fetchKbContent, replaceKbDocument } from "@/lib/elevenlabs-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-scoped KB read/write. Resolves the agent from the signed-in user's
 * tenant_members → tenants → agents chain (RLS-gated), then delegates to
 * the same EL-side logic the operator sibling uses.
 */

export async function GET(_req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  return fetchKbContent(ctx.ctx.providerAgentId, apiKey);
}

const PutSchema = z.object({
  markdown: z.string().min(20).max(200_000),
  documentName: z.string().min(2).max(200),
});

export async function PUT(req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });
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
  return replaceKbDocument(
    ctx.ctx.providerAgentId,
    apiKey,
    parsed.data.markdown,
    parsed.data.documentName,
  );
}

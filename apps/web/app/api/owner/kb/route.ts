import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveOwnerAgent } from "@/lib/owner-agent-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-scoped KB read/write. Mirrors the operator route at
 * /api/agents/[providerAgentId]/knowledge but:
 *   - resolves the agent from the signed-in user's tenant_members → tenants
 *     → agents chain (RLS-gated, so user can only see their own tenant);
 *   - exposes only the knowledge_md (markdown content) field. No other
 *     EL agent fields are reachable through this sibling.
 *
 * This is intentionally a sibling route rather than an extension of the
 * operator route — keeps the auth surface obvious (operator routes stay
 * operator-only; owner routes stay tenant-member-only) and avoids field-
 * level allow-listing inside a shared handler.
 *
 * The owner-agent resolver lives in @/lib/owner-agent-context — shared with
 * /api/owner/voice and /api/owner/settings.
 */

export async function GET(_req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  const { providerAgentId } = ctx.ctx;

  const agentRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!agentRes.ok) {
    return NextResponse.json(
      { error: "elevenlabs_get_agent_failed", status: agentRes.status },
      { status: 502 },
    );
  }
  const agent = (await agentRes.json()) as {
    conversation_config?: {
      agent?: { prompt?: { knowledge_base?: Array<{ id?: string; name?: string }> } };
    };
  };
  const kbList = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
  const firstDoc = kbList[0];
  if (!firstDoc?.id) {
    return NextResponse.json({ markdown: "", documentId: null, documentName: null });
  }

  const docRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/knowledge-base/${encodeURIComponent(firstDoc.id)}/content`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!docRes.ok) {
    return NextResponse.json({
      markdown: "",
      documentId: firstDoc.id,
      documentName: firstDoc.name ?? "",
      fetchError: `EL ${docRes.status}`,
    });
  }
  const content = await docRes.text();
  return NextResponse.json({
    markdown: content,
    documentId: firstDoc.id,
    documentName: firstDoc.name ?? "",
  });
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
  const { providerAgentId } = ctx.ctx;

  const uploadRes = await fetch("https://api.elevenlabs.io/v1/convai/knowledge-base/text", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: parsed.data.documentName,
      text: parsed.data.markdown,
    }),
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    return NextResponse.json(
      { error: "kb_upload_failed", status: uploadRes.status, body: text.slice(0, 400) },
      { status: 502 },
    );
  }
  const uploaded = (await uploadRes.json()) as { id?: string; document_id?: string };
  const newDocId = uploaded.id ?? uploaded.document_id;
  if (!newDocId) {
    return NextResponse.json({ error: "kb_upload_no_id" }, { status: 502 });
  }

  const attachRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: [
                {
                  type: "text",
                  id: newDocId,
                  name: parsed.data.documentName,
                  usage_mode: "auto",
                },
              ],
            },
          },
        },
      }),
    },
  );
  if (!attachRes.ok) {
    const text = await attachRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "kb_attach_failed",
        status: attachRes.status,
        body: text.slice(0, 400),
        newDocId,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, newDocId });
}

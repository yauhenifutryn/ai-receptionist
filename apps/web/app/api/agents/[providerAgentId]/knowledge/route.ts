import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

/**
 * GET — return the current KB markdown content of the first attached
 * document so the operator can edit it in place.
 *
 * PUT — replace the agent's KB with a single new document containing the
 * updated markdown. Implementation: upload a new doc, PATCH the agent to
 * reference only that doc. We don't delete old docs (they're harmless +
 * keep a manual rollback path). Cleanup can be a post-sprint job.
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

  // 1. Fetch the agent to discover its first KB doc id.
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

  // 2. Fetch the doc's content.
  const docRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/knowledge-base/${encodeURIComponent(firstDoc.id)}/content`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!docRes.ok) {
    // Fall back: at least return the doc id + name so the UI shows what's
    // attached even if content fetch failed (e.g. EL's content endpoint
    // not yet GA for this doc type).
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

  // 1. Upload the new doc.
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

  // 2. Attach to agent (replace existing KB list).
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

import { NextResponse } from "next/server";

/**
 * Read + replace the first attached knowledge-base document on an EL ConvAI
 * agent. Same EL-side logic for /api/agents/[id]/knowledge (operator) and
 * /api/owner/kb (tenant member) — only the auth gate differs, so both
 * routes delegate here after their own gates fire.
 *
 * We standardise on NOT echoing EL response bodies into our JSON error
 * payload (the owner route's behaviour before extraction) to avoid leaking
 * EL schema or workspace detail to authenticated clients. Status code +
 * code string is enough for our wizard to surface a useful message.
 */

export async function fetchKbContent(
  providerAgentId: string,
  apiKey: string,
): Promise<NextResponse> {
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

  // 2. Fetch the doc's content. Fall back to id+name only if content fetch
  //    fails — the UI still has something to show.
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

export async function replaceKbDocument(
  providerAgentId: string,
  apiKey: string,
  markdown: string,
  documentName: string,
): Promise<NextResponse> {
  // 1. Upload a fresh doc. EL returns either `id` or `document_id` depending
  //    on the endpoint version; handle both.
  const uploadRes = await fetch("https://api.elevenlabs.io/v1/convai/knowledge-base/text", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ name: documentName, text: markdown }),
  });
  if (!uploadRes.ok) {
    return NextResponse.json(
      { error: "kb_upload_failed", status: uploadRes.status },
      { status: 502 },
    );
  }
  const uploaded = (await uploadRes.json()) as { id?: string; document_id?: string };
  const newDocId = uploaded.id ?? uploaded.document_id;
  if (!newDocId) {
    return NextResponse.json({ error: "kb_upload_no_id" }, { status: 502 });
  }

  // 2. Attach to agent (replace existing KB list — old docs stay in EL
  //    workspace for manual rollback but are detached).
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
                { type: "text", id: newDocId, name: documentName, usage_mode: "auto" },
              ],
            },
          },
        },
      }),
    },
  );
  if (!attachRes.ok) {
    return NextResponse.json(
      { error: "kb_attach_failed", status: attachRes.status, newDocId },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, newDocId });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ElevenLabsConvAIProvider } from "@ai-receptionist/backend/orchestration";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { openExistingSession, openTestSession } from "@/lib/test-session-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerEmail: z.string().email().optional(),
  knowledgeMarkdown: z.string().min(20).max(200_000),
  systemPrompt: z.string().min(50).max(20_000).optional(),
  sourceUrl: z.string().url().optional(),
  /** Continue logging into the existing prepare session if the wizard
   *  passes it through. Otherwise a fresh session is opened. */
  sessionSlug: z.string().min(1).max(160).optional(),
});

interface ProvisionResponse {
  tenantId: string;
  agentId: string;
  browserTestUrl: string;
  knowledgeDocumentId: string;
  sessionSlug?: string;
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
  const input = parsed.data;

  // Reuse the prepare session if the wizard provided it; otherwise open a
  // fresh session so paste-only flows also get logged.
  const session =
    (input.sessionSlug ? await openExistingSession(input.sessionSlug) : null) ??
    (await openTestSession(input.tenantName).catch(() => null));

  await session?.event("provision:start", {
    tenantName: input.tenantName,
    sourceUrl: input.sourceUrl,
    hasSystemPromptOverride: !!input.systemPrompt,
    knowledgeMarkdownLength: input.knowledgeMarkdown.length,
  });
  await session?.write("07-provision-input.json", JSON.stringify({
    tenantName: input.tenantName,
    sourceUrl: input.sourceUrl,
    ownerEmail: input.ownerEmail ?? null,
    knowledgeMarkdownLength: input.knowledgeMarkdown.length,
    systemPromptLength: input.systemPrompt?.length ?? null,
  }, null, 2));
  // Snapshot the EXACT reviewed-by-user prompt + KB that the wizard sent,
  // not just what /api/prepare initially generated.
  if (input.systemPrompt) {
    await session?.write("07a-provision-system-prompt.md", input.systemPrompt);
  }
  await session?.write("07b-provision-knowledge.md", input.knowledgeMarkdown);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    await session?.event("provision:error", { code: "elevenlabs_api_key_missing" });
    return NextResponse.json(
      { error: "elevenlabs_api_key_missing" },
      { status: 500 },
    );
  }

  const origin = req.nextUrl.origin;
  const serverToolBaseUrl = origin;
  const postCallWebhookUrl = `${origin}/api/post-call`;

  const supabase = getServiceRoleSupabase();
  const provider = new ElevenLabsConvAIProvider({ apiKey });

  // 1. Insert tenant.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from("tenants")
    .insert({
      name: input.tenantName,
      display_name: input.tenantName,
      owner_email: input.ownerEmail ?? null,
      source_url: input.sourceUrl ?? null,
    })
    .select("id")
    .single();
  if (tenantErr || !tenantRow) {
    await session?.event("provision:error", {
      code: "tenant_insert_failed",
      message: tenantErr?.message ?? "no row",
    });
    return NextResponse.json(
      { error: "tenant_insert_failed", message: tenantErr?.message ?? "no row" },
      { status: 500 },
    );
  }
  const tenantId = tenantRow.id as string;
  await session?.event("supabase:tenant_inserted", { tenantId });

  // 2. Upload knowledge document.
  let knowledgeDocumentId: string;
  try {
    const kb = await provider.uploadKnowledgeDocument({
      tenantId,
      name: `${input.tenantName} — knowledge`,
      markdown: input.knowledgeMarkdown,
    });
    knowledgeDocumentId = kb.documentId;
    await session?.event("elevenlabs:kb_uploaded", { knowledgeDocumentId });
  } catch (e) {
    await session?.event("provision:error", {
      code: "kb_upload_failed",
      message: (e as Error).message,
      tenantId,
    });
    return NextResponse.json(
      { error: "kb_upload_failed", message: (e as Error).message, tenantId },
      { status: 502 },
    );
  }

  // 3. Provision agent.
  let provisionResult;
  try {
    provisionResult = await provider.provisionAgent({
      tenantId,
      tenantDisplayName: input.tenantName,
      knowledgeBaseDocumentIds: [knowledgeDocumentId],
      serverToolBaseUrl,
      postCallWebhookUrl,
      defaultLanguage: "pl",
      ...(input.systemPrompt ? { systemPromptOverride: input.systemPrompt } : {}),
    });
    await session?.event("elevenlabs:agent_provisioned", {
      agentId: provisionResult.agentId,
      browserTestUrl: provisionResult.browserTestUrl,
    });
  } catch (e) {
    await session?.event("provision:error", {
      code: "agent_provision_failed",
      message: (e as Error).message,
      tenantId,
      knowledgeDocumentId,
    });
    return NextResponse.json(
      {
        error: "agent_provision_failed",
        message: (e as Error).message,
        tenantId,
        knowledgeDocumentId,
      },
      { status: 502 },
    );
  }

  // 4. Insert agents row.
  const { error: agentErr } = await supabase.from("agents").insert({
    tenant_id: tenantId,
    provider: "elevenlabs",
    provider_agent_id: provisionResult.agentId,
    voice_id: null,
    default_language: "pl",
    status: "live",
  });
  if (agentErr) {
    await session?.event("provision:error", {
      code: "agent_row_insert_failed",
      message: agentErr.message,
      tenantId,
      knowledgeDocumentId,
      agentId: provisionResult.agentId,
    });
    return NextResponse.json(
      {
        error: "agent_row_insert_failed",
        message: agentErr.message,
        tenantId,
        knowledgeDocumentId,
        agentId: provisionResult.agentId,
      },
      { status: 500 },
    );
  }

  await session?.event("provision:done", {
    tenantId,
    agentId: provisionResult.agentId,
    knowledgeDocumentId,
    sessionDir: session?.dir,
  });
  await session?.write(
    "08-provision-done.json",
    JSON.stringify(
      {
        tenantId,
        agentId: provisionResult.agentId,
        knowledgeDocumentId,
        browserTestUrl: provisionResult.browserTestUrl,
      },
      null,
      2,
    ),
  );

  const body: ProvisionResponse = {
    tenantId,
    agentId: provisionResult.agentId,
    browserTestUrl: provisionResult.browserTestUrl,
    knowledgeDocumentId,
    ...(session?.slug ? { sessionSlug: session.slug } : {}),
  };
  return NextResponse.json(body, { status: 200 });
}

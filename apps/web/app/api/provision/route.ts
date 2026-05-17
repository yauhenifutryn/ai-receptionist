import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ElevenLabsConvAIProvider } from "@ai-receptionist/backend/orchestration";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerEmail: z.string().email().optional(),
  knowledgeMarkdown: z.string().min(20).max(200_000),
  language: z.enum(["pl", "en", "ru"]).default("pl"),
});

interface ProvisionResponse {
  tenantId: string;
  agentId: string;
  browserTestUrl: string;
  knowledgeDocumentId: string;
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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
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
    })
    .select("id")
    .single();
  if (tenantErr || !tenantRow) {
    return NextResponse.json(
      { error: "tenant_insert_failed", message: tenantErr?.message ?? "no row" },
      { status: 500 },
    );
  }
  const tenantId = tenantRow.id as string;

  // 2. Upload knowledge document.
  let knowledgeDocumentId: string;
  try {
    const kb = await provider.uploadKnowledgeDocument({
      tenantId,
      name: `${input.tenantName} — knowledge`,
      markdown: input.knowledgeMarkdown,
    });
    knowledgeDocumentId = kb.documentId;
  } catch (e) {
    return NextResponse.json(
      { error: "kb_upload_failed", message: (e as Error).message, tenantId },
      { status: 502 },
    );
  }

  // 3. Provision agent on ElevenLabs.
  let provisionResult;
  try {
    provisionResult = await provider.provisionAgent({
      tenantId,
      tenantDisplayName: input.tenantName,
      knowledgeBaseDocumentIds: [knowledgeDocumentId],
      serverToolBaseUrl,
      postCallWebhookUrl,
      defaultLanguage: input.language,
    });
  } catch (e) {
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

  // 4. Insert agents row referencing the provisioned ConvAI agent.
  const { error: agentErr } = await supabase.from("agents").insert({
    tenant_id: tenantId,
    provider: "elevenlabs",
    provider_agent_id: provisionResult.agentId,
    voice_id: null,
    default_language: input.language,
    status: "live",
  });
  if (agentErr) {
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

  const body: ProvisionResponse = {
    tenantId,
    agentId: provisionResult.agentId,
    browserTestUrl: provisionResult.browserTestUrl,
    knowledgeDocumentId,
  };
  return NextResponse.json(body, { status: 200 });
}

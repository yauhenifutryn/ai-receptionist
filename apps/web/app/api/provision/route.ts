import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ElevenLabsConvAIProvider } from "@ai-receptionist/backend/orchestration";
import { getOperatorOrJsonError } from "@/lib/supabase-server";
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
  // Operator-only. Clients never reach this route — sales reps provision on
  // their behalf and ship them a phone number. See
  // docs/plans/2026-05-19-chat1-prod-auth.md.
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }

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

  // ElevenLabs cloud calls back to our webhooks (server tools + post-call).
  // In dev that's localhost — unreachable from their cloud. PUBLIC_BASE_URL
  // overrides the request origin so an ngrok / production URL can be used.
  // In production we refuse unreachable origins to prevent silent webhook
  // failure that only shows up when a real call lands.
  const baseUrl = resolveBaseUrl(req);
  if (!baseUrl.ok) {
    await session?.event("provision:error", {
      code: "public_base_url_unreachable",
      message: baseUrl.message,
    });
    return NextResponse.json(
      { error: "public_base_url_unreachable", message: baseUrl.message },
      { status: 500 },
    );
  }
  // Provider appends "/tools/<name>" to this base, so /api must be included
  // here — otherwise ElevenLabs POSTs to /tools/* which 404s in Next.js.
  const serverToolBaseUrl = `${baseUrl.value}/api`;
  const postCallWebhookUrl = `${baseUrl.value}/api/post-call`;

  // User-scoped client. RLS fires; operator policies must allow insert (see
  // migration 20260519120000_operator_role_and_phone.sql).
  const supabase = operator.supabase;
  const provider = new ElevenLabsConvAIProvider({ apiKey });

  // 1. Insert tenant — stamp provisioner for audit.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from("tenants")
    .insert({
      name: input.tenantName,
      display_name: input.tenantName,
      owner_email: input.ownerEmail ?? null,
      source_url: input.sourceUrl ?? null,
      provisioned_by_user_id: operator.user.id,
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

  // 1b. Link the operator to the new tenant so subsequent reads via RLS
  // also work via the tenant_member path (defense-in-depth on top of the
  // operator bypass). Best-effort: a failure here doesn't block the rest
  // of provisioning since the operator bypass already grants access.
  const { error: memberErr } = await supabase.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: operator.user.id,
    role: "operator",
  });
  if (memberErr) {
    await session?.event("provision:warning", {
      code: "tenant_member_insert_failed",
      message: memberErr.message,
      tenantId,
    });
  }

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
      cleanupRequired: true,
    });
    return NextResponse.json(
      {
        error: "agent_provision_failed",
        message: (e as Error).message,
        tenantId,
        knowledgeDocumentId,
        partialResources: {
          knowledgeDocumentId,
          cleanupRequired: true,
          reason: "agent creation failed after knowledge document upload",
        },
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
    provisioned_by_user_id: operator.user.id,
  });
  if (agentErr) {
    // Roll back the cloud agent so we don't leave a billable orphan with
    // no local DB row. Best-effort: if delete fails, surface both errors.
    let rollback: "ok" | "failed" = "ok";
    let rollbackError: string | undefined;
    try {
      await provider.deleteAgent({ agentId: provisionResult.agentId });
    } catch (e) {
      rollback = "failed";
      rollbackError = (e as Error).message;
    }
    await session?.event("provision:error", {
      code: "agent_row_insert_failed",
      message: agentErr.message,
      tenantId,
      knowledgeDocumentId,
      agentId: provisionResult.agentId,
      rollback,
      ...(rollbackError ? { rollbackError } : {}),
    });
    return NextResponse.json(
      {
        error: "agent_row_insert_failed",
        message: agentErr.message,
        tenantId,
        knowledgeDocumentId,
        agentId: provisionResult.agentId,
        rollback,
        ...(rollbackError ? { rollbackError } : {}),
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

type BaseUrlResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * Pick the canonical public base URL ElevenLabs cloud should call back on:
 *   - PUBLIC_BASE_URL env wins (use this in deployed envs)
 *   - Falls back to req.nextUrl.origin (localhost in dev)
 *   - In production, refuses to provision against localhost/private origins
 *     because those webhooks would silently fail when ElevenLabs hits them.
 */
function resolveBaseUrl(req: NextRequest): BaseUrlResult {
  const envBase = process.env.PUBLIC_BASE_URL?.trim();
  const candidate = envBase && envBase.length > 0 ? envBase : req.nextUrl.origin;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, message: `invalid base URL: ${candidate}` };
  }
  const isProd = process.env.NODE_ENV === "production";
  const host = parsed.hostname;
  const isUnreachable =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isProd && isUnreachable) {
    return {
      ok: false,
      message: `PUBLIC_BASE_URL must be a publicly reachable URL in production (got '${parsed.origin}'). Set PUBLIC_BASE_URL env to your production domain or an ngrok URL.`,
    };
  }
  // Strip trailing slash for predictable concatenation.
  const normalized = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  return { ok: true, value: normalized };
}

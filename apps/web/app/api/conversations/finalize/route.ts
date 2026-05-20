import { NextResponse, type NextRequest } from "next/server";
import { FinalizeConversationRequestSchema } from "@ai-receptionist/contracts";
import { handleFinalizeConversation } from "@ai-receptionist/backend/conversations";
import { fetchElevenLabsConversation } from "@ai-receptionist/backend/integrations/elevenlabs";
import { createSupabasePostCallRepository } from "@ai-receptionist/backend/post-call/supabase-repository";
import { getServiceRoleSupabase, getUserSupabase } from "@/lib/supabase-server";

/**
 * POST /api/conversations/finalize
 *
 * Called by the browser/PIN test UIs when an EL session ends. Fetches the
 * canonical EL conversation record and writes a conversations row. PSTN
 * sessions do NOT use this route — they flow through the post-call webhook.
 *
 * Auth model:
 *   - source=browser_test → operator session required (cookie JWT)
 *   - source=pin_demo     → PIN in body must match agents.pin_code
 *
 * The handler in apps/backend is the source of truth; this route only
 * resolves Supabase clients + the operator flag and forwards.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = FinalizeConversationRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Operator flag: present a user session and check the operator_emails
  // allow-list. A missing session is fine — only the browser_test branch
  // actually requires isOperator=true in the handler.
  const userSupabase = await getUserSupabase();
  const { data: userData } = await userSupabase.auth.getUser();
  let isOperator = false;
  if (userData.user?.email) {
    const { data: op } = await userSupabase
      .from("operator_emails")
      .select("email")
      .eq("email", userData.user.email)
      .maybeSingle();
    isOperator = !!op;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_env_missing" }, { status: 500 });
  }

  const service = getServiceRoleSupabase();
  const repo = createSupabasePostCallRepository(service);

  const r = await handleFinalizeConversation(parsed.data, {
    isOperator,
    pinMatchAgentId: parsed.data.source === "pin_demo" ? parsed.data.agentId : null,
    fetchEl: ({ conversationId }) => fetchElevenLabsConversation({ conversationId, apiKey }),
    repo,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

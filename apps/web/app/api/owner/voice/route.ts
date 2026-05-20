import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveOwnerAgent } from "@/lib/owner-agent-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-scoped voice read/write. Sibling to the operator config route at
 * /api/agents/[id]/config — same architectural choice as /api/owner/kb:
 * dedicated owner route so the auth surface is obvious and the writeable
 * field set is locked to {voiceId} only. Owners cannot change system
 * prompt, first message, LLM, or any other agent setting from this path.
 *
 * Owner-agent resolver lives in @/lib/owner-agent-context — shared with
 * /api/owner/kb and /api/owner/settings.
 */

export async function GET(_req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "elevenlabs_api_key_missing" }, { status: 500 });
  }
  const { providerAgentId } = ctx.ctx;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: "elevenlabs_get_agent_failed", status: res.status },
      { status: 502 },
    );
  }
  const agent = (await res.json()) as {
    conversation_config?: { tts?: { voice_id?: string } };
  };
  return NextResponse.json({
    voiceId: agent.conversation_config?.tts?.voice_id ?? "",
  });
}

const PatchSchema = z.object({
  voiceId: z.string().min(8).max(80),
});

export async function PATCH(req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
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

  const patchRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_config: { tts: { voice_id: parsed.data.voiceId } },
      }),
    },
  );
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "elevenlabs_patch_failed",
        status: patchRes.status,
        body: text.slice(0, 800),
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

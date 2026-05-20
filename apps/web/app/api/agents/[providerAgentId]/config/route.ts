import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KbEntry {
  type?: string;
  id?: string;
  name?: string;
  usage_mode?: string;
}

/**
 * GET + PATCH the essentials of an ElevenLabs ConvAI agent — system prompt,
 * voice, first message — without exposing the dozens of less-essential
 * tuning knobs (LLM choice, temperature, TTS stability, ASR provider). The
 * exposed fields are what we'll show clients in Chat 3 dashboards too.
 *
 * Operator-only. Direct passthrough to ElevenLabs.
 */

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

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

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "elevenlabs_get_agent_failed",
        status: res.status,
        body: text.slice(0, 400),
      },
      { status: 502 },
    );
  }
  const agent = (await res.json()) as {
    conversation_config?: {
      agent?: {
        first_message?: string;
        language?: string;
        prompt?: { prompt?: string; knowledge_base?: KbEntry[] };
      };
      tts?: { voice_id?: string };
    };
  };

  const conv = agent.conversation_config;
  const prompt = conv?.agent?.prompt;
  const knowledgeDocs = (prompt?.knowledge_base ?? []).map((k) => ({
    id: k.id ?? "",
    name: k.name ?? "",
    type: k.type ?? "text",
  }));

  return NextResponse.json({
    providerAgentId,
    systemPrompt: prompt?.prompt ?? "",
    firstMessage: conv?.agent?.first_message ?? "",
    voiceId: conv?.tts?.voice_id ?? "",
    language: conv?.agent?.language ?? "pl",
    knowledgeDocs,
  });
}

const PatchSchema = z
  .object({
    systemPrompt: z.string().min(50).max(20_000).optional(),
    firstMessage: z.string().min(5).max(500).optional(),
    voiceId: z.string().min(8).max(80).optional(),
  })
  .refine((v) => v.systemPrompt || v.firstMessage || v.voiceId, {
    message: "At least one of systemPrompt, firstMessage, voiceId must be provided",
  });

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }

  const { providerAgentId } = await params;
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

  // Build the partial PATCH body. We only send fields the caller wants
  // changed; EL preserves everything else.
  const agentBlock: Record<string, unknown> = {};
  if (parsed.data.firstMessage !== undefined) {
    agentBlock.first_message = parsed.data.firstMessage;
  }
  if (parsed.data.systemPrompt !== undefined) {
    agentBlock.prompt = { prompt: parsed.data.systemPrompt };
  }

  const conv: Record<string, unknown> = {};
  if (Object.keys(agentBlock).length > 0) conv.agent = agentBlock;
  if (parsed.data.voiceId !== undefined) {
    conv.tts = { voice_id: parsed.data.voiceId };
  }

  const body: Record<string, unknown> = { conversation_config: conv };

  const patchRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
    {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

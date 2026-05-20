import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bind a Twilio EU phone number to a provisioned ElevenLabs ConvAI agent.
 * Operator-only.
 *
 * Flow:
 *  1. Resolve the operator and find the local agents row by provider_agent_id.
 *  2. POST /v1/convai/phone-numbers — register the Twilio number with EL.
 *  3. PATCH /v1/convai/phone-numbers/{id} — bind agent_id to the new number.
 *  4. Persist phone_number on agents row (unique partial index on the column
 *     surfaces collisions early — same number can't bind to two agents).
 *
 * The Twilio credentials are forwarded to ElevenLabs once and never persisted
 * locally. ElevenLabs holds them on their side for outbound + inbound routing.
 *
 * Sales-rep workflow: paste Twilio SID + token + the bought PL number, hit
 * submit, share the number with the prospect. They call it cold, get the
 * Polish AI receptionist trained on their own clinic, sign the pilot.
 */

const BodySchema = z.object({
  providerAgentId: z.string().min(8).max(80),
  phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, "must be E.164"),
  label: z.string().min(2).max(120),
  twilioAccountSid: z.string().regex(/^AC[a-zA-Z0-9]{32}$/, "must be a Twilio Account SID"),
  twilioAuthToken: z.string().min(20).max(80),
});

interface ImportNumberResponse {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  agentId: string;
  message: string;
}

export async function POST(req: NextRequest) {
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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "elevenlabs_api_key_missing" },
      { status: 500 },
    );
  }

  // 1. Look up our agents row. Operator can read all via RLS bypass.
  const { data: agentRow, error: agentLookupErr } = await operator.supabase
    .from("agents")
    .select("id, provider_agent_id, phone_number, status")
    .eq("provider_agent_id", input.providerAgentId)
    .maybeSingle();
  if (agentLookupErr) {
    return NextResponse.json(
      { error: "agent_lookup_failed", message: agentLookupErr.message },
      { status: 500 },
    );
  }
  if (!agentRow) {
    return NextResponse.json(
      { error: "agent_not_found", providerAgentId: input.providerAgentId },
      { status: 404 },
    );
  }
  if (agentRow.phone_number) {
    return NextResponse.json(
      {
        error: "agent_already_has_number",
        existingPhoneNumber: agentRow.phone_number,
        message:
          "This agent already has a phone number assigned. Detach in the ElevenLabs dashboard before reassigning.",
      },
      { status: 409 },
    );
  }

  // 2. Create the phone number on ElevenLabs side.
  let phoneNumberId: string;
  try {
    const createRes = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        phone_number: input.phoneNumber,
        label: input.label,
        provider: "twilio",
        sid: input.twilioAccountSid,
        token: input.twilioAuthToken,
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "elevenlabs_create_phone_failed",
          status: createRes.status,
          body: truncate(errText, 800),
        },
        { status: 502 },
      );
    }
    const createJson = (await createRes.json()) as { phone_number_id?: string };
    if (!createJson.phone_number_id) {
      return NextResponse.json(
        {
          error: "elevenlabs_create_phone_missing_id",
          response: createJson,
        },
        { status: 502 },
      );
    }
    phoneNumberId = createJson.phone_number_id;
  } catch (e) {
    return NextResponse.json(
      { error: "elevenlabs_create_phone_threw", message: (e as Error).message },
      { status: 502 },
    );
  }

  // 3. Bind to the agent_id.
  try {
    const patchRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({ agent_id: input.providerAgentId }),
      },
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => "");
      // Best-effort cleanup: we leave the created phone-number on EL side
      // for the operator to inspect / delete in the EL dashboard. Returning
      // the id so they can.
      return NextResponse.json(
        {
          error: "elevenlabs_bind_phone_failed",
          status: patchRes.status,
          body: truncate(errText, 800),
          phoneNumberId,
        },
        { status: 502 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "elevenlabs_bind_phone_threw",
        message: (e as Error).message,
        phoneNumberId,
      },
      { status: 502 },
    );
  }

  // 4. Persist on our side.
  const { error: updateErr } = await operator.supabase
    .from("agents")
    .update({ phone_number: input.phoneNumber })
    .eq("id", agentRow.id);
  if (updateErr) {
    return NextResponse.json(
      {
        error: "supabase_update_failed",
        message: updateErr.message,
        phoneNumberId,
        warning:
          "EL phone-number bound but local DB not updated. Manually reconcile via UPDATE agents SET phone_number = ... WHERE id = ...",
      },
      { status: 500 },
    );
  }

  const body: ImportNumberResponse = {
    phoneNumber: input.phoneNumber,
    elevenLabsPhoneNumberId: phoneNumberId,
    agentId: input.providerAgentId,
    message: `Twilio number ${input.phoneNumber} bound to agent ${input.providerAgentId}.`,
  };
  return NextResponse.json(body, { status: 200 });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

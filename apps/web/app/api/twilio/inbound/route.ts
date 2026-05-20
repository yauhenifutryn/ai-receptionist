import { NextResponse } from "next/server";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

/**
 * Twilio (and Zadarma — same TwiML/SIP-redirect shape) inbound voice webhook.
 *
 * Flow:
 *   1. Caller dials the shared PSTN number.
 *   2. Twilio/Zadarma POSTs here with no Digits → we play a Polish prompt
 *      and <Gather> 4-6 digits, then redirect back here with Digits=...
 *   3. We look up agents.pin_code → if match, return <Dial><Sip> to the EL
 *      agent's SIP endpoint. If no match, re-prompt or hang up.
 *
 * Feature-flagged off (TWILIO_INBOUND_ENABLED) so the route exists but is a
 * no-op until the user binds a real PSTN number. Once Zadarma passport
 * verification clears and the +48 58 number is bound, set the env var to "1".
 */
const ENABLED = process.env.TWILIO_INBOUND_ENABLED === "1";

function xml(body: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!ENABLED) {
    // Disabled — silent hang-up so we don't leak schema or 500 on
    // unexpected hits from carrier health-checks.
    return xml(`<Hangup/>`);
  }
  const form = await req.formData();
  const digits = form.get("Digits");
  if (typeof digits !== "string") {
    // Step 1: prompt for PIN. Polish TTS via Twilio's <Say language="pl-PL">.
    return xml(
      `<Gather input="dtmf" numDigits="4" finishOnKey="#" timeout="10" action="/api/twilio/inbound" method="POST"><Say language="pl-PL">Wpisz cztery cyfry kodu kliniki, a następnie naciśnij krzyżyk.</Say></Gather><Say language="pl-PL">Nie odebraliśmy kodu. Do widzenia.</Say><Hangup/>`,
    );
  }
  // Step 2: look up agent by PIN.
  if (!/^\d{4,6}$/.test(digits)) {
    return xml(
      `<Say language="pl-PL">Nieprawidłowy kod. Spróbuj ponownie.</Say><Redirect method="POST">/api/twilio/inbound</Redirect>`,
    );
  }
  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("agents")
    .select("provider_agent_id")
    .eq("pin_code", digits)
    .maybeSingle();
  if (error || !data) {
    return xml(`<Say language="pl-PL">Nie znaleziono kliniki dla tego kodu.</Say><Hangup/>`);
  }
  // Step 3: SIP-dial the EL agent.
  // Endpoint format per ElevenLabs docs: sip:<provider_agent_id>@sip.elevenlabs.io
  // Verify exact format on first real wiring.
  const sipUri = `sip:${data.provider_agent_id}@sip.elevenlabs.io`;
  return xml(`<Dial answerOnBridge="true"><Sip>${sipUri}</Sip></Dial>`);
}

import { describe, expect, it } from "vitest";
import { PostCallWebhookSchema } from "@ai-receptionist/contracts";
import { adaptElevenLabsPostCall } from "../../src/post-call/elevenlabs-adapter.js";

// Shape captured from a REAL EL post-call payload (conversation
// conv_7401ktc63gdwf7zvqmy6sk7ddb21, 2026-06-05 SIP demo call), trimmed.
// EL wraps the conversation object in { type, event_timestamp, data }.
const elPayload = {
  type: "post_call_transcription",
  event_timestamp: 1780673090,
  data: {
    agent_id: "agent_3101krxkms8eepdr8ycf626krdss",
    conversation_id: "conv_7401ktc63gdwf7zvqmy6sk7ddb21",
    status: "done",
    transcript: [
      { role: "agent", message: "Dzień dobry, jestem Michał.", time_in_call_secs: 0 },
      { role: "user", message: "Dzień dobry. Ile kosztuje konsultacja?", time_in_call_secs: 6 },
      { role: "agent", message: null, time_in_call_secs: 9 },
    ],
    metadata: {
      start_time_unix_secs: 1780673004,
      call_duration_secs: 73,
      main_language: "pl",
      termination_reason: "Client disconnected: 1000",
      phone_call: {
        direction: "inbound",
        agent_number: "+480009243772",
        external_number: "+48573444255",
        type: "sip_trunking",
        sip_header_dynamic_variables: { sip_demo_pin: "324014" },
      },
    },
    analysis: {},
  },
};

describe("adaptElevenLabsPostCall", () => {
  it("maps a real EL post_call_transcription payload to the internal schema", () => {
    const adapted = adaptElevenLabsPostCall(elPayload);
    expect(adapted).not.toBeNull();
    // Must pass the strict internal schema — this is the property that broke
    // in production (raw EL JSON 400'd on PostCallWebhookSchema).
    const parsed = PostCallWebhookSchema.parse(adapted);

    expect(parsed.conversationId).toBe("conv_7401ktc63gdwf7zvqmy6sk7ddb21");
    expect(parsed.agentId).toBe("agent_3101krxkms8eepdr8ycf626krdss");
    expect(parsed.startedAt).toBe(new Date(1780673004 * 1000).toISOString());
    expect(parsed.endedAt).toBe(new Date((1780673004 + 73) * 1000).toISOString());
    expect(parsed.durationSeconds).toBe(73);
    expect(parsed.endReason).toBe("Client disconnected: 1000");
    expect(parsed.direction).toBe("inbound");

    // Transcript turns: seconds → ms, null message tolerated, endMs = next start.
    expect(parsed.transcript).toHaveLength(3);
    expect(parsed.transcript[0]).toMatchObject({
      role: "agent",
      text: "Dzień dobry, jestem Michał.",
      startMs: 0,
      endMs: 6000,
    });
    expect(parsed.transcript[2]).toMatchObject({ role: "agent", text: "", startMs: 9000 });

    // Demo defaults: no consent question is asked (Option B), so ambiguous/false.
    expect(parsed.derived.consentDecision).toBe("ambiguous");
    expect(parsed.derived.consentFlag).toBe(false);
    expect(parsed.derived.callerLanguage).toBe("pl");

    // Caller phone path the handler reads: raw.metadata.phone_call.from_phone_number.
    // EL calls it external_number — adapter must normalize.
    const raw = parsed.raw as {
      metadata: { phone_call: { from_phone_number: string } };
    };
    expect(raw.metadata.phone_call.from_phone_number).toBe("+48573444255");
  });

  it("returns null for non-EL payloads (internal shape passes through untouched)", () => {
    expect(adaptElevenLabsPostCall({ conversationId: "x", agentId: "y" })).toBeNull();
    expect(adaptElevenLabsPostCall(null)).toBeNull();
    expect(adaptElevenLabsPostCall("nope")).toBeNull();
  });

  it("returns null for non-transcription EL events (e.g. post_call_audio)", () => {
    expect(adaptElevenLabsPostCall({ type: "post_call_audio", data: {} })).toBeNull();
  });

  it("falls back to pl for unsupported main_language values", () => {
    const p = structuredClone(elPayload);
    p.data.metadata.main_language = "uk";
    const adapted = adaptElevenLabsPostCall(p);
    expect(PostCallWebhookSchema.parse(adapted).derived.callerLanguage).toBe("pl");
  });
});

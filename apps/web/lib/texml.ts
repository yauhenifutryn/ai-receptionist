// apps/web/lib/texml.ts
// TeXML response builders for the demo-line PIN IVR. Pure string builders —
// no I/O — so every branch is snapshot-testable. TeXML is Telnyx's TwiML
// dialect: <Gather> collects DTMF, <Dial><Sip> bridges to ElevenLabs.
// Spec: docs/superpowers/specs/2026-06-04-clinic-demo-line-sip-design.md

export const MAX_PIN_ATTEMPTS = 3;

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>`;

export interface GatherOptions {
  /** Public origin for callback + audio URLs, no trailing slash. */
  baseUrl: string;
  /** 1-based attempt counter; attempt>1 plays the invalid-code prompt. */
  attempt: number;
}

export function gatherPinTexml({ baseUrl, attempt }: GatherOptions): string {
  const prompt = attempt > 1 ? "pin-invalid.mp3" : "pin-prompt.mp3";
  const action = `${baseUrl}/api/telnyx/demo-line/resolve?attempt=${attempt}`;
  const onSilence = `${baseUrl}/api/telnyx/demo-line?attempt=${attempt + 1}`;
  return [
    XML_HEADER,
    `<Response>`,
    `<Gather action="${action}" method="POST" numDigits="6" timeout="10" validDigits="0123456789">`,
    `<Play>${baseUrl}/ivr/${prompt}</Play>`,
    `</Gather>`,
    // Reached only when Gather times out with no input.
    `<Redirect method="POST">${onSilence}</Redirect>`,
    `</Response>`,
  ].join("");
}

export interface DialSipOptions {
  /** Virtual EL identifier (never dialable), e.g. +48000123456. */
  virtualE164: string;
  /** The validated 6-digit PIN; forwarded as a SIP X-header so it lands in
   *  the agent as a {{sip_*}} dynamic variable. */
  pin: string;
}

export function dialSipTexml({ virtualE164, pin }: DialSipOptions): string {
  if (!/^\d{6}$/.test(pin)) throw new Error("pin must be exactly 6 digits");
  if (!/^\+\d{6,15}$/.test(virtualE164)) throw new Error("virtualE164 must be E.164");
  const uri = `sip:${virtualE164}@sip.rtc.elevenlabs.io:5061;transport=tls?X-demo-pin=${pin}`;
  return [XML_HEADER, `<Response>`, `<Dial>`, `<Sip>${uri}</Sip>`, `</Dial>`, `</Response>`].join(
    "",
  );
}

export function goodbyeTexml(baseUrl: string): string {
  return [
    XML_HEADER,
    `<Response>`,
    `<Play>${baseUrl}/ivr/goodbye.mp3</Play>`,
    `<Hangup/>`,
    `</Response>`,
  ].join("");
}

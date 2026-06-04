// apps/web/test/texml.test.ts
import { describe, expect, it } from "vitest";
import { gatherPinTexml, dialSipTexml, goodbyeTexml, MAX_PIN_ATTEMPTS } from "../lib/texml";

const BASE = "https://demo.example.com";

describe("gatherPinTexml", () => {
  it("emits a 6-digit Gather posting to the resolve route with attempt tracking", () => {
    const xml = gatherPinTexml({ baseUrl: BASE, attempt: 1 });
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(
      `<Gather action="${BASE}/api/telnyx/demo-line/resolve?attempt=1" method="POST" numDigits="6" timeout="10" validDigits="0123456789">`,
    );
    expect(xml).toContain(`<Play>${BASE}/ivr/pin-prompt.mp3</Play>`);
    // Silence fallthrough: re-enter the gather with attempt+1
    expect(xml).toContain(
      `<Redirect method="POST">${BASE}/api/telnyx/demo-line?attempt=2</Redirect>`,
    );
  });

  it("plays the invalid-code prompt on retries", () => {
    const xml = gatherPinTexml({ baseUrl: BASE, attempt: 2 });
    expect(xml).toContain(`<Play>${BASE}/ivr/pin-invalid.mp3</Play>`);
  });

  it("at the final attempt, redirect points past the cap (route will goodbye)", () => {
    const xml = gatherPinTexml({ baseUrl: BASE, attempt: MAX_PIN_ATTEMPTS });
    expect(xml).toContain(
      `<Redirect method="POST">${BASE}/api/telnyx/demo-line?attempt=${MAX_PIN_ATTEMPTS + 1}</Redirect>`,
    );
    expect(xml).toContain(`<Play>${BASE}/ivr/pin-invalid.mp3</Play>`);
  });
});

describe("dialSipTexml", () => {
  it("bridges to the virtual identifier over TLS with the PIN as a SIP URI header", () => {
    const xml = dialSipTexml({ virtualE164: "+48000123456", pin: "123456" });
    expect(xml).toContain(
      `<Sip>sip:+48000123456@sip.rtc.elevenlabs.io:5061;transport=tls?X-demo-pin=123456</Sip>`,
    );
  });

  it("XML-escapes nothing it should not — digits only enforced upstream", () => {
    // Defense in depth: non-digit pin must throw, never reach XML.
    expect(() => dialSipTexml({ virtualE164: "+48000123456", pin: "12<6&6" })).toThrow();
  });
});

describe("goodbyeTexml", () => {
  it("plays goodbye and hangs up", () => {
    const xml = goodbyeTexml(BASE);
    expect(xml).toContain(`<Play>${BASE}/ivr/goodbye.mp3</Play>`);
    expect(xml).toContain("<Hangup/>");
  });
});

it("exposes the attempt cap used by the routes", () => {
  expect(MAX_PIN_ATTEMPTS).toBe(3);
});

describe("XML-unsafe baseUrl guard", () => {
  it("rejects XML-unsafe baseUrl (defense in depth)", () => {
    expect(() => gatherPinTexml({ baseUrl: 'https://x"y', attempt: 1 })).toThrow();
    expect(() => goodbyeTexml("https://x&y")).toThrow();
  });
});

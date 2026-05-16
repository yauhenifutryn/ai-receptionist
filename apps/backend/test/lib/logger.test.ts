import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, scrubForLog } from "../../src/lib/logger.js";

const PHONE = "+48 600 123 456";
const NAME = "Jan Kowalski";
const EMAIL = "jan.kowalski@example.com";

function captureStream() {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  return {
    stream,
    read: () => Buffer.concat(chunks).toString("utf-8"),
  };
}

describe("PII-redacting logger (W2.6)", () => {
  it("scrubForLog redacts name (PII field), phone, and email", () => {
    const out = scrubForLog({
      patientName: NAME,
      patientPhone: PHONE,
      email: EMAIL,
      note: `Caller ${PHONE} asked to be reached at ${EMAIL}`,
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain(NAME);
    expect(s).not.toContain(PHONE);
    expect(s).not.toContain(EMAIL);
    expect(s).toContain("[REDACTED]");
  });

  it("logger output contains zero of the PII substrings (structured fields + free text)", () => {
    const cap = captureStream();
    const log = createLogger({ destination: cap.stream });

    log.info(
      {
        patientName: NAME,
        patientPhone: PHONE,
        email: EMAIL,
        nested: { contact: { email: EMAIL, phone: PHONE }, ref: NAME },
      },
      `incoming call from ${PHONE} (${EMAIL})`,
    );

    const out = cap.read();
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain(NAME);
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
  });

  it("redacts nested objects and arrays recursively", () => {
    const out = scrubForLog({
      bookings: [
        { patientPhone: PHONE, slot: "10:00" },
        { patientPhone: "+48 700 000 111", slot: "11:00" },
      ],
      callerNames: { primary: NAME },
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain(NAME);
    expect(s).not.toContain(PHONE);
    expect(s).not.toContain("+48 700 000 111");
  });

  it("leaves non-PII payloads intact", () => {
    const out = scrubForLog({
      tenantId: "tenant-abc",
      bookingCount: 4,
      status: "ok",
    });
    expect(out).toEqual({
      tenantId: "tenant-abc",
      bookingCount: 4,
      status: "ok",
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  AppointmentCategorySchema,
  ConsentClassifierResultSchema,
  ScraperOutputSchema,
  PostCallWebhookSchema,
  CheckAvailabilityRequestSchema,
  CreateBookingRequestSchema,
  ServiceValueMatrixSchema,
} from "@ai-receptionist/contracts";

describe("contracts importable from backend + parse round-trip", () => {
  it("AppointmentCategory accepts a known value", () => {
    expect(AppointmentCategorySchema.parse("consultation")).toBe("consultation");
  });

  it("ConsentClassifierResult parses a happy-path result", () => {
    const r = ConsentClassifierResultSchema.parse({
      decision: "yes",
      confidence: 0.91,
      utterance: "tak, zgadzam się",
      language: "pl",
    });
    expect(r.decision).toBe("yes");
  });

  it("ScraperOutput parses a minimal happy-path payload with default arrays", () => {
    const r = ScraperOutputSchema.parse({
      sourceUrl: "https://example.com",
      scrapedAt: new Date().toISOString(),
      tenant: { name: "Example Tenant" },
    });
    expect(r.staff).toEqual([]);
    expect(r.services).toEqual([]);
    expect(r.faq).toEqual([]);
    expect(r.hasUnknownPrices).toBe(false);
  });

  it("CheckAvailability + CreateBooking request schemas reject malformed payloads", () => {
    expect(() =>
      CheckAvailabilityRequestSchema.parse({ requestId: "not-a-uuid", agentId: "a" }),
    ).toThrow();
    expect(() =>
      CreateBookingRequestSchema.parse({
        requestId: "11111111-1111-1111-1111-111111111111",
        agentId: "a",
        slotId: "s",
      }),
    ).toThrow();
  });

  it("PostCallWebhook parses the minimum required fields with defaults", () => {
    const now = new Date().toISOString();
    const r = PostCallWebhookSchema.parse({
      conversationId: "c1",
      agentId: "a1",
      startedAt: now,
      endedAt: now,
      durationSeconds: 0,
      endReason: "user_hangup",
      derived: {},
    });
    expect(r.derived.consentFlag).toBe(false);
    expect(r.transcript).toEqual([]);
  });

  it("ServiceValueMatrix parses a single-row matrix", () => {
    const r = ServiceValueMatrixSchema.parse({
      tenantId: "11111111-1111-1111-1111-111111111111",
      rows: [{ category: "consultation", expectedRevenuePln: 250 }],
      updatedAt: new Date().toISOString(),
    });
    expect(r.rows[0]?.showRate).toBe(0.7);
  });
});

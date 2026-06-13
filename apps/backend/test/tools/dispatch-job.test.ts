import { describe, it, expect } from "vitest";
import {
  handleDispatchJob,
  formatDispatchSms,
  type DispatchFailureLogInput,
} from "../../src/tools/dispatch-job.js";
import type { SmsClient, SendSmsInput } from "../../src/integrations/sms/index.js";

const baseBody = {
  agentId: "agent_1",
  problem: "zalany salon, leje sie z sufitu",
  address: "ul. Glowna 5, Warszawa",
  urgency: "pilne, woda kapie na klientow",
  callbackPhone: "+48501234567",
};

function recordingSms(): { sent: SendSmsInput[]; client: SmsClient } {
  const sent: SendSmsInput[] = [];
  return {
    sent,
    client: {
      async send(input) {
        sent.push(input);
        return { messageId: "msg_1" };
      },
    },
  };
}

describe("formatDispatchSms", () => {
  it("includes business name, problem, address, urgency, and callback phone", () => {
    const s = formatDispatchSms(
      {
        problem: "brak pradu w mieszkaniu",
        address: "ul. Testowa 1",
        urgency: "pilne",
        callbackPhone: "+48600100200",
      },
      "Elektryk 24h",
    );
    expect(s).toContain("Elektryk 24h");
    expect(s).toContain("brak pradu w mieszkaniu");
    expect(s).toContain("ul. Testowa 1");
    expect(s).toContain("pilne");
    expect(s).toContain("+48600100200");
  });

  it("omits the urgency line when not provided", () => {
    const s = formatDispatchSms(
      { problem: "p", address: "a", callbackPhone: "+48600100200" },
      "Firma",
    );
    expect(s).not.toContain("Pilnosc");
  });
});

describe("handleDispatchJob", () => {
  it("sends the job by SMS to the dispatch phone and reports dispatched", async () => {
    const sms = recordingSms();
    const result = await handleDispatchJob(baseBody, {
      smsClient: sms.client,
      dispatchPhone: "+48600700800",
      businessName: "Hydraulik Alex",
    });
    expect(result.ok).toBe(true);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0].to).toBe("+48600700800");
    expect(sms.sent[0].body).toContain("ul. Glowna 5, Warszawa");
    expect(sms.sent[0].body).toContain("+48501234567");
    if (result.ok) expect(result.response.dispatched).toBe(true);
  });

  it("returns a 400 validation error when problem/address/phone are missing", async () => {
    const result = await handleDispatchJob(
      { agentId: "agent_1", callbackPhone: "+48501234567" },
      { dispatchPhone: "+48600700800", businessName: "X" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("fails soft (dispatched:false, ok:true) when no dispatch phone is configured", async () => {
    const sms = recordingSms();
    const result = await handleDispatchJob(baseBody, {
      smsClient: sms.client,
      dispatchPhone: null,
      businessName: "X",
    });
    expect(result.ok).toBe(true);
    expect(sms.sent).toHaveLength(0);
    if (result.ok) expect(result.response.dispatched).toBe(false);
  });

  it("fails soft and logs when the SMS send throws, never breaking the call", async () => {
    const logged: DispatchFailureLogInput[] = [];
    const throwing: SmsClient = {
      async send() {
        throw new Error("zadarma 500");
      },
    };
    const result = await handleDispatchJob(baseBody, {
      smsClient: throwing,
      dispatchPhone: "+48600700800",
      businessName: "X",
      tenantId: "tenant_1",
      smsFailureLogger: {
        async logFailure(input) {
          logged.push(input);
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.dispatched).toBe(false);
    expect(logged).toHaveLength(1);
    expect(logged[0].toPhone).toBe("+48600700800");
  });
});

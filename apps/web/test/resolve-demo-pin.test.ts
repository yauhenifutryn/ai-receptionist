// apps/web/test/resolve-demo-pin.test.ts
import { describe, expect, it } from "vitest";
import { pickAgentByPin, type LineAssignment } from "../lib/resolve-demo-pin";

const assignments: LineAssignment[] = [
  { agentId: "a1", providerAgentId: "agent_one", pinCode: "111111", elVirtualE164: "+48000000001" },
  { agentId: "a2", providerAgentId: "agent_two", pinCode: "222222", elVirtualE164: "+48000000002" },
  { agentId: "a3", providerAgentId: "agent_rot", pinCode: null, elVirtualE164: "+48000000003" },
];

describe("pickAgentByPin", () => {
  it("matches the agent whose pin_code equals the digits", () => {
    expect(pickAgentByPin(assignments, "222222")?.agentId).toBe("a2");
  });

  it("returns null on unknown pin", () => {
    expect(pickAgentByPin(assignments, "999999")).toBeNull();
  });

  it("never matches agents with a rotated (null) pin", () => {
    expect(pickAgentByPin(assignments, "")).toBeNull();
  });

  it("rejects malformed digits (length, non-numeric)", () => {
    expect(pickAgentByPin(assignments, "11111")).toBeNull();
    expect(pickAgentByPin(assignments, "11111a")).toBeNull();
  });

  it("never matches an assignment missing its virtual identifier", () => {
    const broken: LineAssignment[] = [
      { agentId: "a4", providerAgentId: "agent_x", pinCode: "444444", elVirtualE164: null },
    ];
    expect(pickAgentByPin(broken, "444444")).toBeNull();
  });
});

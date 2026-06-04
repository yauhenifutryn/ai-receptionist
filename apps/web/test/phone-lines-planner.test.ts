import { describe, expect, it } from "vitest";
import { planAssign, planUnassign } from "../lib/phone-lines";

describe("planAssign", () => {
  it("first agent on a line → direct wiring, no virtuals", () => {
    const effects = planAssign({ currentAgentIds: [], newAgentId: "a1" });
    expect(effects).toEqual([
      { kind: "bind_real_resource", agentId: "a1" },
      { kind: "point_telnyx_to", target: "fqdn" },
      { kind: "set_mode", mode: "direct" },
      { kind: "insert_assignment", agentId: "a1", needsVirtual: false },
    ]);
  });

  it("second agent → flip to pin: virtuals for BOTH, telnyx to texml", () => {
    const effects = planAssign({ currentAgentIds: ["a1"], newAgentId: "a2" });
    expect(effects).toEqual([
      { kind: "ensure_virtual", agentId: "a1" },
      { kind: "ensure_virtual", agentId: "a2" },
      { kind: "point_telnyx_to", target: "texml" },
      { kind: "set_mode", mode: "pin" },
      { kind: "insert_assignment", agentId: "a2", needsVirtual: true },
    ]);
  });

  it("third agent on a pin line → just add a virtual + row", () => {
    const effects = planAssign({ currentAgentIds: ["a1", "a2"], newAgentId: "a3" });
    expect(effects).toEqual([
      { kind: "ensure_virtual", agentId: "a3" },
      { kind: "insert_assignment", agentId: "a3", needsVirtual: true },
    ]);
  });

  it("rejects assigning an already-assigned agent", () => {
    expect(() => planAssign({ currentAgentIds: ["a1"], newAgentId: "a1" })).toThrow();
  });
});

describe("planUnassign", () => {
  it("removing down to one agent → flip back to direct", () => {
    const effects = planUnassign({ currentAgentIds: ["a1", "a2"], removeAgentId: "a2" });
    expect(effects).toEqual([
      { kind: "delete_virtual", agentId: "a2" },
      { kind: "delete_assignment", agentId: "a2" },
      { kind: "delete_virtual", agentId: "a1" },
      { kind: "bind_real_resource", agentId: "a1" },
      { kind: "point_telnyx_to", target: "fqdn" },
      { kind: "set_mode", mode: "direct" },
    ]);
  });

  it("removing the last agent → line idle (direct, unbound)", () => {
    const effects = planUnassign({ currentAgentIds: ["a1"], removeAgentId: "a1" });
    expect(effects).toEqual([
      { kind: "delete_assignment", agentId: "a1" },
      { kind: "unbind_real_resource" },
      { kind: "set_mode", mode: "direct" },
    ]);
  });

  it("removing one of 3+ keeps pin mode", () => {
    const effects = planUnassign({ currentAgentIds: ["a1", "a2", "a3"], removeAgentId: "a3" });
    expect(effects).toEqual([
      { kind: "delete_virtual", agentId: "a3" },
      { kind: "delete_assignment", agentId: "a3" },
    ]);
  });

  it("rejects removing an agent not on the line", () => {
    expect(() => planUnassign({ currentAgentIds: ["a1"], removeAgentId: "a9" })).toThrow();
  });
});

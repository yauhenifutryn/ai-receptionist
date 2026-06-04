// apps/web/lib/resolve-demo-pin.ts
// Pure PIN→agent matcher for the demo-line IVR. The route queries
// phone_line_agents joined to agents for the dialed line and hands rows here.
// Invariant protected: a caller entering clinic X's valid PIN always reaches
// clinic X's agent and never another's; an invalid PIN reaches no agent.

export interface LineAssignment {
  agentId: string;
  providerAgentId: string;
  /** agents.pin_code — null after rotation. */
  pinCode: string | null;
  /** Virtual EL identifier; null while the line is in direct mode. */
  elVirtualE164: string | null;
}

export function pickAgentByPin(
  assignments: LineAssignment[],
  digits: string,
): LineAssignment | null {
  if (!/^\d{6}$/.test(digits)) return null;
  const match = assignments.find((a) => a.pinCode !== null && a.pinCode === digits);
  if (!match || !match.elVirtualE164) return null;
  return match;
}

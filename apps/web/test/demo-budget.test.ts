// apps/web/test/demo-budget.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEMO_SECONDS_BUDGET,
  getDemoBudgetStatus,
  type DemoBudgetReader,
} from "../lib/demo-budget";

const AGENT = "agent_test123";

function reader(over: Partial<DemoBudgetReader>): DemoBudgetReader {
  return {
    readAgentBudget: async () => ({ budgetSeconds: 1800, sinceIso: "2026-06-08T00:00:00Z" }),
    sumUsedSeconds: async () => 0,
    ...over,
  };
}

describe("getDemoBudgetStatus", () => {
  it("is not over budget when used seconds are below the budget", async () => {
    const s = await getDemoBudgetStatus(reader({ sumUsedSeconds: async () => 600 }), AGENT);
    expect(s.usedSeconds).toBe(600);
    expect(s.budgetSeconds).toBe(1800);
    expect(s.overBudget).toBe(false);
  });

  it("is over budget exactly at the budget (>=, not >)", async () => {
    const s = await getDemoBudgetStatus(reader({ sumUsedSeconds: async () => 1800 }), AGENT);
    expect(s.overBudget).toBe(true);
  });

  it("is over budget past the budget", async () => {
    const s = await getDemoBudgetStatus(reader({ sumUsedSeconds: async () => 2000 }), AGENT);
    expect(s.overBudget).toBe(true);
  });

  it("fails open for an unknown agent (no row): never blocks", async () => {
    const s = await getDemoBudgetStatus(reader({ readAgentBudget: async () => null }), AGENT);
    expect(s.overBudget).toBe(false);
    expect(s.usedSeconds).toBe(0);
    expect(s.budgetSeconds).toBe(DEFAULT_DEMO_SECONDS_BUDGET);
  });

  it("falls back to the default budget when the stored budget is non-positive", async () => {
    const s = await getDemoBudgetStatus(
      reader({
        readAgentBudget: async () => ({ budgetSeconds: 0, sinceIso: "2026-06-08T00:00:00Z" }),
        sumUsedSeconds: async () => 1900,
      }),
      AGENT,
    );
    expect(s.budgetSeconds).toBe(DEFAULT_DEMO_SECONDS_BUDGET);
    expect(s.overBudget).toBe(true); // 1900 >= 1800
  });

  it("meters only usage since the agent's budget cutoff", async () => {
    const sum = vi.fn(async () => 100);
    await getDemoBudgetStatus(
      reader({
        readAgentBudget: async () => ({ budgetSeconds: 1800, sinceIso: "2026-06-08T12:00:00Z" }),
        sumUsedSeconds: sum,
      }),
      AGENT,
    );
    expect(sum).toHaveBeenCalledWith(AGENT, "2026-06-08T12:00:00Z");
  });
});

// apps/web/lib/demo-budget.ts
//
// Per-clinic demo minute budget. ElevenLabs ConvAI bills per minute and all
// agents draw from ONE shared workspace credit pool, so without this one
// clinic testing heavily could drain the pool and starve the others. Each
// agent gets a fixed budget (default 30 min); usage is the sum of completed-
// call durations since the agent's `demo_budget_since` cutoff (so test
// minutes spent before the budget shipped don't count). Enforced at call
// START in the phone IVR resolve route — a correct PIN routes to a
// "demo limit reached" prompt instead of <Dial> once the agent is over.
//
// Granularity note: checked at call start against COMPLETED calls, so the
// worst-case overspend is one in-progress call beyond the budget. Bounded
// and acceptable; neither we nor EL can stop a call mid-stream.
import type { SupabaseClient } from "@supabase/supabase-js";

/** 30 minutes. Matches the `agents.demo_seconds_budget` column default. */
export const DEFAULT_DEMO_SECONDS_BUDGET = 1800;

export interface DemoBudgetReader {
  /** Budget + cutoff for an agent, or null when the agent row is absent. */
  readAgentBudget(
    providerAgentId: string,
  ): Promise<{ budgetSeconds: number; sinceIso: string } | null>;
  /** Sum of completed-call seconds for the agent at/after `sinceIso`. */
  sumUsedSeconds(providerAgentId: string, sinceIso: string): Promise<number>;
}

export interface DemoBudgetStatus {
  usedSeconds: number;
  budgetSeconds: number;
  overBudget: boolean;
}

/**
 * Pure budget decision over an injected reader. Fail-open by construction:
 * an unknown agent yields `overBudget: false`. I/O errors are the CALLER's
 * responsibility to catch (the resolve route treats any throw as "allow").
 */
export async function getDemoBudgetStatus(
  reader: DemoBudgetReader,
  providerAgentId: string,
): Promise<DemoBudgetStatus> {
  const agent = await reader.readAgentBudget(providerAgentId);
  if (!agent) {
    // Unknown agent: nothing to meter. The PIN match already proved the
    // agent exists, so this only happens on a race/inconsistency — fail open.
    return { usedSeconds: 0, budgetSeconds: DEFAULT_DEMO_SECONDS_BUDGET, overBudget: false };
  }
  const budgetSeconds = agent.budgetSeconds > 0 ? agent.budgetSeconds : DEFAULT_DEMO_SECONDS_BUDGET;
  const usedSeconds = await reader.sumUsedSeconds(providerAgentId, agent.sinceIso);
  return { usedSeconds, budgetSeconds, overBudget: usedSeconds >= budgetSeconds };
}

/**
 * Supabase-backed reader. Reads the agent's budget/cutoff, then sums
 * `conversations.duration_seconds` for that provider_agent_id since the
 * cutoff (served by the (provider_agent_id, started_at) index).
 */
export function createSupabaseDemoBudgetReader(client: SupabaseClient): DemoBudgetReader {
  return {
    async readAgentBudget(providerAgentId) {
      const { data, error } = await client
        .from("agents")
        .select("demo_seconds_budget, demo_budget_since")
        .eq("provider_agent_id", providerAgentId)
        .maybeSingle();
      if (error) throw new Error(`demo-budget: agents read failed: ${error.message}`);
      if (!data) return null;
      const budgetSeconds =
        typeof data.demo_seconds_budget === "number"
          ? data.demo_seconds_budget
          : DEFAULT_DEMO_SECONDS_BUDGET;
      const sinceIso =
        typeof data.demo_budget_since === "string"
          ? data.demo_budget_since
          : new Date(0).toISOString();
      return { budgetSeconds, sinceIso };
    },
    async sumUsedSeconds(providerAgentId, sinceIso) {
      const { data, error } = await client
        .from("conversations")
        .select("duration_seconds")
        .eq("provider_agent_id", providerAgentId)
        .gte("started_at", sinceIso);
      if (error) throw new Error(`demo-budget: conversations sum failed: ${error.message}`);
      return (data ?? []).reduce((acc: number, row: { duration_seconds: number | null }) => {
        return acc + (typeof row.duration_seconds === "number" ? row.duration_seconds : 0);
      }, 0);
    },
  };
}

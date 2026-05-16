import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { LLMClient, type LLMProvider, type LLMModel } from "../../src/lib/llm.js";

const RESULT_SCHEMA = z.object({
  decision: z.enum(["yes", "no"]),
  confidence: z.number().min(0).max(1),
});

function makeProvider(impl: LLMProvider["generateJson"]): LLMProvider {
  return { generateJson: impl };
}

const noSleep = () => Promise.resolve();

describe("LLMClient (W2 foundation)", () => {
  it("returns parsed data from primary model on success", async () => {
    const provider = makeProvider(async () => ({
      text: JSON.stringify({ decision: "yes", confidence: 0.92 }),
    }));
    const client = new LLMClient(provider, { sleep: noSleep });

    const result = await client.generateStructured({
      model: "gemini-3.1-flash-lite",
      user: "Caller said: Tak",
      schema: RESULT_SCHEMA,
    });

    expect(result.data).toEqual({ decision: "yes", confidence: 0.92 });
    expect(result.modelUsed).toBe("gemini-3.1-flash-lite");
    expect(result.attempts).toBe(1);
  });

  it("falls back through the chain when earlier models throw", async () => {
    const calls: LLMModel[] = [];
    const provider = makeProvider(async ({ model }) => {
      calls.push(model);
      if (model === "gemini-3.1-pro-preview") throw new Error("429 rate-limited");
      if (model === "gemini-2.5-pro") throw new Error("503 unavailable");
      return { text: JSON.stringify({ decision: "no", confidence: 0.81 }) };
    });
    const client = new LLMClient(provider, { sleep: noSleep, defaultMaxRetries: 0 });

    const result = await client.generateStructured({
      model: "gemini-3.1-pro-preview",
      fallbackChain: ["gemini-2.5-pro", "gemini-3-flash-preview"],
      user: "Test",
      schema: RESULT_SCHEMA,
    });

    expect(calls).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-3-flash-preview",
    ]);
    expect(result.modelUsed).toBe("gemini-3-flash-preview");
    expect(result.data.decision).toBe("no");
  });

  it("retries the same model on parse/validation failure, then advances", async () => {
    let perModelCount = 0;
    const provider = makeProvider(async ({ model }) => {
      perModelCount++;
      if (perModelCount === 1) return { text: "not json at all" };
      if (perModelCount === 2) return { text: JSON.stringify({ decision: "maybe" }) };
      return { text: JSON.stringify({ decision: "yes", confidence: 0.9 }) };
    });
    const client = new LLMClient(provider, { sleep: noSleep, defaultMaxRetries: 2 });
    const result = await client.generateStructured({
      model: "gemini-3.1-flash-lite",
      user: "Test",
      schema: RESULT_SCHEMA,
    });
    expect(result.data).toEqual({ decision: "yes", confidence: 0.9 });
    expect(result.attempts).toBe(3);
  });

  it("throws LLMClientError when every model + retry exhausts", async () => {
    const provider = makeProvider(async () => {
      throw new Error("network down");
    });
    const client = new LLMClient(provider, { sleep: noSleep, defaultMaxRetries: 1 });

    await expect(
      client.generateStructured({
        model: "gemini-3.1-pro-preview",
        fallbackChain: ["gemini-2.5-pro"],
        user: "Test",
        schema: RESULT_SCHEMA,
      }),
    ).rejects.toThrow(/exhausted/i);
  });

  it("forwards system, user, jsonSchema, temperature, maxOutputTokens to provider", async () => {
    const seen: Parameters<LLMProvider["generateJson"]>[0][] = [];
    const provider = makeProvider(async (args) => {
      seen.push(args);
      return { text: JSON.stringify({ decision: "yes", confidence: 0.99 }) };
    });
    const client = new LLMClient(provider, { sleep: noSleep });

    await client.generateStructured({
      model: "gemini-3.1-flash-lite",
      system: "You are a classifier.",
      user: "tak",
      schema: RESULT_SCHEMA,
      jsonSchema: { type: "object" },
      temperature: 0,
      maxOutputTokens: 64,
    });

    expect(seen[0]).toMatchObject({
      model: "gemini-3.1-flash-lite",
      system: "You are a classifier.",
      user: "tak",
      jsonSchema: { type: "object" },
      temperature: 0,
      maxOutputTokens: 64,
    });
  });

  it("dedupes identical entries when the chain repeats the primary model", async () => {
    const calls: LLMModel[] = [];
    const provider = makeProvider(async ({ model }) => {
      calls.push(model);
      throw new Error("boom");
    });
    const client = new LLMClient(provider, { sleep: noSleep, defaultMaxRetries: 0 });
    await expect(
      client.generateStructured({
        model: "gemini-3.1-pro-preview",
        fallbackChain: ["gemini-3.1-pro-preview", "gemini-2.5-pro"],
        user: "x",
        schema: RESULT_SCHEMA,
      }),
    ).rejects.toThrow();
    expect(calls).toEqual(["gemini-3.1-pro-preview", "gemini-2.5-pro"]);
  });
});

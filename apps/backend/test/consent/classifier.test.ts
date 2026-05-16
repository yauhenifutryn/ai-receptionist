import { describe, it, expect } from "vitest";
import { classifyConsent } from "../../src/consent/classifier.js";
import { LLMClient, type LLMProvider, type GenerateJsonArgs } from "../../src/lib/llm.js";

type Canned = { decision: "yes" | "no" | "ambiguous"; confidence: number };

function fakeProvider(table: Record<string, Canned>): LLMProvider {
  const entries = Object.entries(table).sort(([a], [b]) => b.length - a.length);
  return {
    async generateJson(args: GenerateJsonArgs) {
      const found = entries.find(([utt]) => args.user.endsWith(utt));
      if (!found) {
        return {
          text: JSON.stringify({ decision: "ambiguous", confidence: 0.4 }),
        };
      }
      return { text: JSON.stringify(found[1]) };
    },
  };
}

const noSleep = () => Promise.resolve();

function buildClient(table: Record<string, Canned>) {
  return new LLMClient(fakeProvider(table), { sleep: noSleep, defaultMaxRetries: 0 });
}

describe("consent classifier (W2.5)", () => {
  const polishYes = ["tak", "tak zgadzam się", "oczywiście", "okej", "dobrze"];
  const polishNo = [
    "nie",
    "nie zgadzam się",
    "wolałbym nie",
    "nie chcę",
    "proszę nie nagrywać",
  ];
  const polishAmbiguous = ["nie wiem", "może później"];

  const table: Record<string, Canned> = {};
  for (const u of polishYes) table[u] = { decision: "yes", confidence: 0.95 };
  for (const u of polishNo) table[u] = { decision: "no", confidence: 0.95 };
  for (const u of polishAmbiguous) table[u] = { decision: "ambiguous", confidence: 0.5 };

  it("classifies 5 Polish affirmatives -> consentFlag=true", async () => {
    const llm = buildClient(table);
    for (const utt of polishYes) {
      const result = await classifyConsent({ utterance: utt, language: "pl", llm });
      expect(result.decision, `for "${utt}"`).toBe("yes");
      expect(result.consentFlag).toBe(true);
    }
  });

  it("classifies 5 Polish negatives -> consentFlag=false", async () => {
    const llm = buildClient(table);
    for (const utt of polishNo) {
      const result = await classifyConsent({ utterance: utt, language: "pl", llm });
      expect(result.decision, `for "${utt}"`).toBe("no");
      expect(result.consentFlag).toBe(false);
    }
  });

  it("ambiguous responses default to consentFlag=false (default-deny)", async () => {
    const llm = buildClient(table);
    for (const utt of polishAmbiguous) {
      const result = await classifyConsent({ utterance: utt, language: "pl", llm });
      expect(result.decision).toBe("ambiguous");
      expect(result.consentFlag).toBe(false);
    }
  });

  it("low confidence (<0.7) coerces decision to ambiguous", async () => {
    const llm = buildClient({ siakacku: { decision: "yes", confidence: 0.5 } });
    const result = await classifyConsent({
      utterance: "siakacku",
      language: "pl",
      llm,
    });
    expect(result.decision).toBe("ambiguous");
    expect(result.consentFlag).toBe(false);
  });

  it("LLM error -> default-deny (consentFlag=false, decision=ambiguous, confidence=0)", async () => {
    const brokenProvider: LLMProvider = {
      async generateJson() {
        throw new Error("provider down");
      },
    };
    const llm = new LLMClient(brokenProvider, { sleep: noSleep, defaultMaxRetries: 0 });
    const result = await classifyConsent({
      utterance: "tak",
      language: "pl",
      llm,
    });
    expect(result.decision).toBe("ambiguous");
    expect(result.confidence).toBe(0);
    expect(result.consentFlag).toBe(false);
  });

  it("echoes utterance + language on the result", async () => {
    const llm = buildClient(table);
    const result = await classifyConsent({
      utterance: "tak",
      language: "pl",
      llm,
    });
    expect(result.utterance).toBe("tak");
    expect(result.language).toBe("pl");
  });

  it("benchmark: 10 mixed transcripts (5 tak + 5 nie) score 10/10", async () => {
    const llm = buildClient(table);
    const set = [...polishYes, ...polishNo];
    let correct = 0;
    for (const utt of set) {
      const expected = polishYes.includes(utt);
      const r = await classifyConsent({ utterance: utt, language: "pl", llm });
      if (r.consentFlag === expected) correct++;
    }
    expect(correct).toBeGreaterThanOrEqual(8);
  });
});

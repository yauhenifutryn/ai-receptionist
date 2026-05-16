import { z } from "zod";
import {
  ConsentClassifierResultSchema,
  type ConsentClassifierResult,
} from "@ai-receptionist/contracts";
import type { LLMClient } from "../lib/llm.js";
import {
  AFFIRMATIVE_EXAMPLES,
  CONSENT_QUESTION,
  NEGATIVE_EXAMPLES,
  type ConsentLanguage,
} from "./script.js";

const CONFIDENCE_THRESHOLD = 0.7;

const LLMConsentResultSchema = z.object({
  decision: z.enum(["yes", "no", "ambiguous"]),
  confidence: z.number().min(0).max(1),
});

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["yes", "no", "ambiguous"] },
    confidence: { type: "number" },
  },
  required: ["decision", "confidence"],
} as const;

export interface ClassifyConsentArgs {
  utterance: string;
  language: ConsentLanguage;
  llm: LLMClient;
}

export interface ConsentClassification extends ConsentClassifierResult {
  consentFlag: boolean;
}

function buildSystemPrompt(language: ConsentLanguage): string {
  const question = CONSENT_QUESTION[language];
  const yes = AFFIRMATIVE_EXAMPLES[language].join(", ");
  const no = NEGATIVE_EXAMPLES[language].join(", ");
  return [
    "You classify a caller's response to a consent question into one of: yes, no, ambiguous.",
    "Output strict JSON. Do not include any explanation outside JSON.",
    `Consent question that was asked (${language}): ${question}`,
    `Affirmative examples (${language}): ${yes}`,
    `Negative examples (${language}): ${no}`,
    "If the caller's response is silent, off-topic, hedged, deferred, or you are not sure: decision=ambiguous, confidence reflecting your doubt.",
  ].join("\n");
}

export async function classifyConsent(
  args: ClassifyConsentArgs,
): Promise<ConsentClassification> {
  const { utterance, language, llm } = args;
  try {
    const result = await llm.generateStructured({
      model: "gemini-3.1-flash-lite",
      system: buildSystemPrompt(language),
      user: `Caller said: ${utterance}`,
      schema: LLMConsentResultSchema,
      jsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0,
      maxOutputTokens: 64,
    });

    const llmDecision = result.data.decision;
    const confidence = result.data.confidence;
    const decision = confidence < CONFIDENCE_THRESHOLD ? "ambiguous" : llmDecision;
    const consentFlag = decision === "yes";

    const base = ConsentClassifierResultSchema.parse({
      decision,
      confidence,
      utterance,
      language,
    });
    return { ...base, consentFlag };
  } catch {
    return {
      decision: "ambiguous",
      confidence: 0,
      utterance,
      language,
      consentFlag: false,
    };
  }
}

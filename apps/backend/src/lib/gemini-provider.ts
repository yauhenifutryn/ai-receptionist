import { GoogleGenAI } from "@google/genai";
import type { GenerateJsonArgs, LLMProvider } from "./llm.js";

export interface CreateGeminiProviderOptions {
  apiKey?: string;
}

export function createGeminiProvider(
  opts: CreateGeminiProviderOptions = {},
): LLMProvider {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "createGeminiProvider: GEMINI_API_KEY missing (pass via opts.apiKey or env)",
    );
  }
  const client = new GoogleGenAI({ apiKey });

  return {
    async generateJson(args: GenerateJsonArgs): Promise<{ text: string }> {
      const response = await client.models.generateContent({
        model: args.model,
        contents: args.user,
        config: {
          ...(args.system !== undefined ? { systemInstruction: args.system } : {}),
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          ...(args.maxOutputTokens !== undefined
            ? { maxOutputTokens: args.maxOutputTokens }
            : {}),
          responseMimeType: "application/json",
          ...(args.jsonSchema !== undefined
            ? { responseSchema: args.jsonSchema as never }
            : {}),
        },
      });
      const text = response.text;
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("Gemini returned empty text");
      }
      return { text };
    },
  };
}

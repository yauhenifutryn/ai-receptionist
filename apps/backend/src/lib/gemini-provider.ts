import { GoogleGenAI } from "@google/genai";
import type { GenerateJsonArgs, LLMProvider } from "./llm.js";

export interface CreateGeminiProviderOptions {
  apiKey?: string;
}

export function createGeminiProvider(opts: CreateGeminiProviderOptions = {}): LLMProvider {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("createGeminiProvider: GEMINI_API_KEY missing (pass via opts.apiKey or env)");
  }
  // 5-minute hard SDK timeout so a stalled response surfaces as a real
  // error instead of an indefinite hang. Healthy consolidate calls finish
  // in 60-90s; this only kicks in when Google or the network are wedged.
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 300_000 },
  });

  return {
    async generateJson(args: GenerateJsonArgs): Promise<{ text: string }> {
      // Stream the response and accumulate chunks. For large structured
      // outputs (50K+ chars), non-streaming generateContent occasionally
      // returns a TRUNCATED body inside our Next.js route while the same
      // call succeeds cleanly in a vanilla Node process. Streaming sidesteps
      // that: chunks arrive incrementally and the SDK assembles the final
      // text from the AsyncGenerator, with no single oversized response
      // body to mishandle.
      const stream = await client.models.generateContentStream({
        model: args.model,
        contents: args.user,
        config: {
          ...(args.system !== undefined ? { systemInstruction: args.system } : {}),
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          ...(args.maxOutputTokens !== undefined ? { maxOutputTokens: args.maxOutputTokens } : {}),
          responseMimeType: "application/json",
          ...(args.jsonSchema !== undefined ? { responseSchema: args.jsonSchema as never } : {}),
          ...(args.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: args.thinkingBudget } }
            : {}),
          ...(args.abortSignal !== undefined ? { abortSignal: args.abortSignal } : {}),
        },
      });
      let text = "";
      for await (const chunk of stream) {
        const piece = chunk.text;
        if (typeof piece === "string" && piece.length > 0) text += piece;
      }
      if (text.length === 0) {
        throw new Error("Gemini returned empty stream");
      }
      return { text };
    },
  };
}

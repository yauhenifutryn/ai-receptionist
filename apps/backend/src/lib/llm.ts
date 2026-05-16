import type { z } from "zod";

export type LLMModel =
  | "gemini-3.1-pro-preview"
  | "gemini-2.5-pro"
  | "gemini-3-flash-preview"
  | "gemini-3.1-flash-lite";

export const DEFAULT_PRO_FALLBACK_CHAIN: LLMModel[] = [
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
];

export interface GenerateJsonArgs {
  model: LLMModel;
  system?: string;
  user: string;
  jsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LLMProvider {
  generateJson(args: GenerateJsonArgs): Promise<{ text: string }>;
}

export interface GenerateStructuredRequest<Schema extends z.ZodTypeAny> {
  model: LLMModel;
  fallbackChain?: LLMModel[];
  system?: string;
  user: string;
  schema: Schema;
  jsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
}

export interface GenerateStructuredResult<Schema extends z.ZodTypeAny> {
  data: z.infer<Schema>;
  modelUsed: LLMModel;
  attempts: number;
}

export class LLMClientError extends Error {
  override readonly name = "LLMClientError";
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}

export interface LLMClientOptions {
  defaultMaxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class LLMClient {
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly provider: LLMProvider,
    opts: LLMClientOptions = {},
  ) {
    this.maxRetries = opts.defaultMaxRetries ?? 1;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async generateStructured<Schema extends z.ZodTypeAny>(
    req: GenerateStructuredRequest<Schema>,
  ): Promise<GenerateStructuredResult<Schema>> {
    const models = dedupe([req.model, ...(req.fallbackChain ?? [])]);
    const maxRetries = req.maxRetries ?? this.maxRetries;
    let attempts = 0;
    let lastError: unknown;

    for (const model of models) {
      for (let retry = 0; retry <= maxRetries; retry++) {
        attempts++;
        try {
          const { text } = await this.provider.generateJson({
            model,
            ...(req.system !== undefined ? { system: req.system } : {}),
            user: req.user,
            ...(req.jsonSchema !== undefined ? { jsonSchema: req.jsonSchema } : {}),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.maxOutputTokens !== undefined
              ? { maxOutputTokens: req.maxOutputTokens }
              : {}),
          });
          const parsedJson = safeJsonParse(text);
          if (parsedJson.ok) {
            const validated = req.schema.safeParse(parsedJson.value);
            if (validated.success) {
              return { data: validated.data, modelUsed: model, attempts };
            }
            lastError = new Error(`Zod validation failed: ${validated.error.message}`);
          } else {
            lastError = new Error(`JSON parse failed: ${parsedJson.error}`);
          }
        } catch (e) {
          lastError = e;
        }
        if (retry < maxRetries) await this.sleep(100 * Math.pow(2, retry));
      }
    }

    throw new LLMClientError(
      `All ${models.length} model(s) exhausted after ${attempts} attempt(s)`,
      lastError,
    );
  }
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const i of items) {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

type ParseOk = { ok: true; value: unknown };
type ParseErr = { ok: false; error: string };

function safeJsonParse(text: string): ParseOk | ParseErr {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

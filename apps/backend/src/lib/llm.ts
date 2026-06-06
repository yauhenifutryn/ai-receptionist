import type { z } from "zod";

export type LLMModel =
  | "gemini-3.1-pro-preview"
  | "gemini-2.5-pro"
  | "gemini-3.5-flash"
  | "gemini-3-flash-preview"
  | "gemini-2.5-flash"
  | "gemini-3.1-flash-lite";

export const DEFAULT_PRO_FALLBACK_CHAIN: LLMModel[] = ["gemini-2.5-pro", "gemini-3-flash-preview"];

export interface GenerateJsonArgs {
  model: LLMModel;
  system?: string;
  user: string;
  jsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Gemini 2.5+ thinking budget. 0 disables thinking (fast, deterministic
   * structured-extraction path). Undefined = model default (dynamic, can
   * spend many minutes on large prompts). Only `gemini-*-flash*` and
   * `gemini-*-pro*` accept this; flash-lite ignores it (no thinking).
   */
  thinkingBudget?: number;
  /**
   * Penalize tokens by how often they've already appeared (Gemini range
   * -2..2). A positive value strongly discourages the degenerate
   * repetition loops that make structured extraction on long Polish
   * service lists run away to the output-token ceiling and truncate
   * mid-JSON. Scales with count, so it punishes a runaway loop far harder
   * than the bounded, legitimate repetition of JSON keys.
   */
  frequencyPenalty?: number;
  /** Penalize tokens that have appeared at all (Gemini range -2..2). Use
   *  sparingly — it also discourages legitimate repeated JSON structure. */
  presencePenalty?: number;
  /**
   * Client-side abort signal. Aborting cancels the in-flight HTTP call
   * to Google. NOTE per Google: cancellation does not stop server-side
   * processing — you may still be billed for tokens already consumed.
   */
  abortSignal?: AbortSignal;
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
  /** See GenerateJsonArgs.thinkingBudget. 0 disables thinking. */
  thinkingBudget?: number;
  /** See GenerateJsonArgs.frequencyPenalty. Anti-repetition-loop. */
  frequencyPenalty?: number;
  /** See GenerateJsonArgs.presencePenalty. */
  presencePenalty?: number;
  /** See GenerateJsonArgs.abortSignal. Cancels in-flight HTTP call. */
  abortSignal?: AbortSignal;
}

export interface GenerateStructuredResult<Schema extends z.ZodTypeAny> {
  data: z.infer<Schema>;
  modelUsed: LLMModel;
  attempts: number;
}

export class LLMClientError extends Error {
  override readonly name = "LLMClientError";
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export interface LLMClientOptions {
  defaultMaxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
            ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
            ...(req.thinkingBudget !== undefined ? { thinkingBudget: req.thinkingBudget } : {}),
            ...(req.frequencyPenalty !== undefined
              ? { frequencyPenalty: req.frequencyPenalty }
              : {}),
            ...(req.presencePenalty !== undefined ? { presencePenalty: req.presencePenalty } : {}),
            ...(req.abortSignal !== undefined ? { abortSignal: req.abortSignal } : {}),
          });
          const parsedJson = safeJsonParse(text);
          if (parsedJson.ok) {
            const validated = req.schema.safeParse(parsedJson.value);
            if (validated.success) {
              return { data: validated.data, modelUsed: model, attempts };
            }
            const msg = validated.error.message;
            lastError = new Error(`Zod validation failed: ${msg}`);
            console.warn(
              `[LLMClient] attempt ${attempts} model=${model} retry=${retry} ZOD_FAIL ` +
                `outputChars=${text.length} :: ${msg.slice(0, 1500)}`,
            );
          } else {
            lastError = new Error(`JSON parse failed: ${parsedJson.error}`);
            console.warn(
              `[LLMClient] attempt ${attempts} model=${model} retry=${retry} JSON_PARSE_FAIL ` +
                `outputChars=${text.length} :: ${parsedJson.error.slice(0, 300)}`,
            );
            console.warn(`[LLMClient]   last 200 chars: ${JSON.stringify(text.slice(-200))}`);
          }
        } catch (e) {
          lastError = e;
          const errMsg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[LLMClient] attempt ${attempts} model=${model} retry=${retry} CALL_THREW :: ${errMsg.slice(0, 300)}`,
          );
        }
        if (retry < maxRetries) await this.sleep(100 * Math.pow(2, retry));
      }
    }

    const causeMsg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new LLMClientError(
      `All ${models.length} model(s) [${models.join(", ")}] exhausted after ${attempts} attempt(s). Last error: ${causeMsg}`,
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

/**
 * Parse JSON from an LLM response, tolerant of leading/trailing prose.
 *
 * Direct `JSON.parse` is the fast path. If it fails, we look for the
 * outermost `{ ... }` substring and try that — handles the "Gemini 3
 * leaks reasoning text before the JSON" pathology (vercel/ai#11396)
 * without giving up the strict path when the response is clean.
 *
 * NB: we DON'T scan for an array; ScraperOutput is always an object.
 * Adding array salvage would let truncated outputs parse as valid
 * partial arrays, which silently drops data — worse than failing.
 */
function safeJsonParse(text: string): ParseOk | ParseErr {
  const direct = tryParse(text);
  if (direct.ok) return direct;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return direct;

  const salvaged = tryParse(text.slice(start, end + 1));
  if (salvaged.ok) return salvaged;
  return direct;
}

function tryParse(text: string): ParseOk | ParseErr {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

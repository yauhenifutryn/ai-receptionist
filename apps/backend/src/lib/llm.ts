import type { z } from "zod";

export type LLMModel =
  | "gemini-3.1-pro-preview"
  | "gemini-2.5-pro"
  | "gemini-3-flash-preview"
  | "gemini-2.5-flash"
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
  /**
   * Gemini 2.5+ thinking budget. 0 disables thinking (fast, deterministic
   * structured-extraction path). Undefined = model default (dynamic, can
   * spend many minutes on large prompts). Only `gemini-*-flash*` and
   * `gemini-*-pro*` accept this; flash-lite ignores it (no thinking).
   */
  thinkingBudget?: number;
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
            ...(req.thinkingBudget !== undefined
              ? { thinkingBudget: req.thinkingBudget }
              : {}),
            ...(req.abortSignal !== undefined
              ? { abortSignal: req.abortSignal }
              : {}),
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
            // Dump truncated/malformed text to /tmp so we can inspect it.
            // Filename includes attempt + model so multiple runs are kept.
            const dumpPath = `/tmp/llm-raw-${model}-attempt${attempts}-${Date.now()}.txt`;
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              require("node:fs").writeFileSync(dumpPath, text);
            } catch {
              // ignore dump failures
            }
            console.warn(
              `[LLMClient] attempt ${attempts} model=${model} retry=${retry} JSON_PARSE_FAIL ` +
                `outputChars=${text.length} dumpedTo=${dumpPath} :: ${parsedJson.error.slice(0, 300)}`,
            );
            console.warn(
              `[LLMClient]   last 200 chars: ${JSON.stringify(text.slice(-200))}`,
            );
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

    const causeMsg =
      lastError instanceof Error ? lastError.message : String(lastError);
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

function safeJsonParse(text: string): ParseOk | ParseErr {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";

const REDACTED = "[REDACTED]";

const PHONE_REGEX = /\+\d[\d\s\-().]{6,}\d/g;
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const PII_FIELD_NAMES: ReadonlySet<string> = new Set([
  "phone",
  "phoneNumber",
  "patientPhone",
  "callerPhone",
  "primaryPhone",
  "email",
  "patientEmail",
  "callerEmail",
  "name",
  "fullName",
  "patientName",
  "callerName",
  "firstName",
  "lastName",
  "ref",
  "primary",
]);

function scrubString(s: string): string {
  return s.replace(PHONE_REGEX, REDACTED).replace(EMAIL_REGEX, REDACTED);
}

function deepScrub(value: unknown, parentKey?: string): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (parentKey && PII_FIELD_NAMES.has(parentKey)) return REDACTED;
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepScrub(v, parentKey));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepScrub(v, k);
    }
    return out;
  }
  return value;
}

export function scrubForLog<T>(payload: T): T {
  return deepScrub(payload) as T;
}

export interface CreateLoggerOptions {
  level?: LoggerOptions["level"];
  destination?: DestinationStream;
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const options: LoggerOptions = {
    level: opts.level ?? process.env.LOG_LEVEL ?? "info",
    base: undefined,
    formatters: {
      log: (obj) => deepScrub(obj) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        const scrubbed = args.map((arg) =>
          typeof arg === "string" ? scrubString(arg) : arg,
        ) as Parameters<typeof method>;
        return method.apply(this, scrubbed);
      },
    },
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}

export const logger: Logger = createLogger();

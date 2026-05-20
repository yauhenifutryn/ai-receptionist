import { createHash, createHmac, randomUUID } from "node:crypto";
import { type SendSmsInput, type SendSmsResult, type SmsClient, SmsSendError } from "./types.js";

export interface ZadarmaSmsClientOptions {
  /** From https://my.zadarma.com/api/ */
  userKey: string;
  /** From https://my.zadarma.com/api/ */
  secretKey: string;
  /** Optional alphanumeric SenderID (requires $20 + 15 day registration). Omit for default. */
  callerId?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const ENDPOINT_PATH = "/v1/sms/send/";
const ENDPOINT_URL = `https://api.zadarma.com${ENDPOINT_PATH}`;

function sortedFormBody(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`).join("&");
}

function buildSignature(methodPath: string, paramsStr: string, secretKey: string): string {
  const md5 = createHash("md5").update(paramsStr).digest("hex");
  const signingString = methodPath + paramsStr + md5;
  return createHmac("sha1", secretKey).update(signingString).digest("base64");
}

export function createZadarmaSmsClient(opts: ZadarmaSmsClientOptions): SmsClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async send(input: SendSmsInput): Promise<SendSmsResult> {
      // Zadarma's `to` parameter expects digits only, no leading +.
      const toDigits = input.to.startsWith("+") ? input.to.slice(1) : input.to;
      const params: Record<string, string> = {
        to: toDigits,
        message: input.body,
      };
      if (opts.callerId) {
        params.caller_id = opts.callerId;
      }
      const paramsStr = sortedFormBody(params);
      const signature = buildSignature(ENDPOINT_PATH, paramsStr, opts.secretKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(ENDPOINT_URL, {
          method: "POST",
          headers: {
            Authorization: `${opts.userKey}:${signature}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: paramsStr,
          signal: controller.signal,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          throw new SmsSendError("timeout", `timed out after ${timeoutMs}ms`);
        }
        throw new SmsSendError("network_error", (e as Error).message);
      } finally {
        clearTimeout(timer);
      }
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        throw new SmsSendError(`http_${res.status}`, "non-json response from Zadarma");
      }
      const obj = parsed as { status?: string; message?: string };
      if (!res.ok) {
        const msg = obj?.message ?? `HTTP ${res.status}`;
        throw new SmsSendError(`http_${res.status}`, msg);
      }
      if (obj.status === "error") {
        throw new SmsSendError("zadarma_error", obj.message ?? "unknown Zadarma SMS error");
      }
      // Zadarma's success response doesn't include a per-message id — we
      // synthesize one so downstream logging has a stable handle.
      return { messageId: `zadarma_${randomUUID()}` };
    },
  };
}

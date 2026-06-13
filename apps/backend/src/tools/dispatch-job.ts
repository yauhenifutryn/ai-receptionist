import type { SmsClient } from "../integrations/sms/index.js";

/**
 * Emergency dispatch tool. For phone-first trades (locksmith, plumber,
 * electrician) the value is not a calendar booking: it is capturing the job the
 * owner could not pick up (hands full on another job, or asleep) and pushing it
 * to him immediately by SMS so he does not lose it to the next number on Google.
 *
 * Reuses the existing SMS path (SmsClient). Fail-soft by design: a missing
 * dispatch number or an SMS provider error must NEVER break the live call, the
 * caller is always reassured. Only a genuinely incomplete job (no problem /
 * address / phone) returns a validation error so the agent re-asks.
 */

export interface DispatchJob {
  problem: string;
  address: string;
  urgency?: string;
  callbackPhone: string;
}

export interface DispatchFailureLogInput {
  tenantId?: string;
  toPhone: string;
  errorCode: string;
  errorMessage: string;
}

export interface DispatchFailureLogger {
  logFailure(input: DispatchFailureLogInput): Promise<void>;
}

export interface DispatchJobDeps {
  smsClient?: SmsClient;
  smsFailureLogger?: DispatchFailureLogger;
  /** The tradesman's number that receives the job SMS. Null when unconfigured. */
  dispatchPhone: string | null;
  businessName: string;
  tenantId?: string;
}

export type DispatchJobOutcome =
  | { ok: true; response: { dispatched: boolean; callerSafeMessage: string } }
  | { ok: false; status: number; error: { code: string; callerSafeMessage: string } };

const REASSURE = "Dziekuje, przekazuje zgloszenie. Fachowiec oddzwoni najszybciej jak to mozliwe.";

export function formatDispatchSms(job: DispatchJob, businessName: string): string {
  const lines = [
    `Nowe zgloszenie (${businessName}):`,
    `Problem: ${job.problem}`,
    `Adres: ${job.address}`,
  ];
  if (job.urgency && job.urgency.trim()) lines.push(`Pilnosc: ${job.urgency}`);
  lines.push(`Telefon: ${job.callbackPhone}`);
  lines.push("Oddzwon jak najszybciej.");
  return lines.join("\n");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function handleDispatchJob(
  body: { problem?: unknown; address?: unknown; urgency?: unknown; callbackPhone?: unknown },
  deps: DispatchJobDeps,
): Promise<DispatchJobOutcome> {
  const problem = asString(body.problem);
  const address = asString(body.address);
  const callbackPhone = asString(body.callbackPhone);
  if (!problem || !address || !callbackPhone) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "validation_failed",
        callerSafeMessage:
          "Potrzebuje jeszcze opisu usterki, adresu i numeru kontaktowego, zeby przekazac zgloszenie.",
      },
    };
  }

  const urgency = asString(body.urgency);
  const job: DispatchJob = {
    problem,
    address,
    callbackPhone,
    ...(urgency ? { urgency } : {}),
  };

  // Fail-soft: never break a live call over configuration or SMS provider issues.
  if (!deps.dispatchPhone || !deps.smsClient) {
    return { ok: true, response: { dispatched: false, callerSafeMessage: REASSURE } };
  }

  try {
    await deps.smsClient.send({
      to: deps.dispatchPhone,
      body: formatDispatchSms(job, deps.businessName),
    });
    return { ok: true, response: { dispatched: true, callerSafeMessage: REASSURE } };
  } catch (err) {
    if (deps.smsFailureLogger) {
      try {
        await deps.smsFailureLogger.logFailure({
          ...(deps.tenantId ? { tenantId: deps.tenantId } : {}),
          toPhone: deps.dispatchPhone,
          errorCode: err instanceof Error ? err.name : "unknown",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      } catch {
        // Never throw from the failure path.
      }
    }
    return { ok: true, response: { dispatched: false, callerSafeMessage: REASSURE } };
  }
}

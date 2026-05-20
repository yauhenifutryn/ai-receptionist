export interface SendSmsInput {
  /** E.164 format, e.g. +48501234567. */
  to: string;
  /** Plain text message body. */
  body: string;
}

export interface SendSmsResult {
  messageId: string;
}

export class SmsSendError extends Error {
  constructor(
    public readonly code: string,
    public readonly providerMessage: string,
  ) {
    super(`SMS send failed (${code}): ${providerMessage}`);
    this.name = "SmsSendError";
  }
}

export interface SmsClient {
  send(input: SendSmsInput): Promise<SendSmsResult>;
}

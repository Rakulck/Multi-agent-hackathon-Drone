import "server-only";

import twilio from "twilio";
import type { CustomerMessageStatus } from "@/types/domain";

export { buildCustomerMessage } from "@/lib/customer-message-templates";

export class TwilioConfigurationError extends Error {
  constructor() {
    super("Twilio messaging is not configured.");
    this.name = "TwilioConfigurationError";
  }
}

export class TwilioMessageError extends Error {
  constructor(readonly safeCode: string) {
    super(`Twilio message delivery failed (${safeCode}).`);
    this.name = "TwilioMessageError";
  }
}

export function resolveTwilioRecipient(params: {
  useDemoRecipient: boolean;
  recipientPhone?: string;
}): string | null {
  return params.useDemoRecipient
    ? process.env.TWILIO_DEMO_RECIPIENT ??
        process.env.TWILIO_TO_NUMBER ??
        null
    : params.recipientPhone ?? null;
}

export function hasTwilioConfiguration() {
  const hasAccountCredentials = Boolean(
    process.env.TWILIO_AUTH_TOKEN ||
      (process.env.TWILIO_API_KEY_SID &&
        process.env.TWILIO_API_KEY_SECRET),
  );
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      hasAccountCredentials &&
      (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER),
  );
}

export async function sendTwilioCustomerUpdate(params: {
  to: string;
  body: string;
}): Promise<{ messageSid: string; status: CustomerMessageStatus }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const from =
    process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER;
  if (
    !accountSid ||
    !from ||
    (!authToken && (!apiKeySid || !apiKeySecret))
  ) {
    throw new TwilioConfigurationError();
  }

  try {
    const client = authToken
      ? twilio(accountSid, authToken)
      : twilio(apiKeySid!, apiKeySecret!, { accountSid });
    const message = await client.messages.create({
      body: params.body,
      from,
      to: params.to,
      statusCallback: publicStatusCallbackUrl(),
    });
    return {
      messageSid: message.sid,
      status: normalizeTwilioMessageStatus(message.status),
    };
  } catch (error) {
    throw new TwilioMessageError(twilioErrorCode(error));
  }
}

export function validateTwilioWebhookSignature(params: {
  signature: string | null;
  url: string;
  form: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !params.signature) return false;
  return twilio.validateRequest(
    authToken,
    params.signature,
    params.url,
    params.form,
  );
}

export function normalizeTwilioMessageStatus(
  status: string,
): CustomerMessageStatus {
  if (status === "delivered") return "delivered";
  if (status === "sent" || status === "sending") return "sent";
  if (
    status === "failed" ||
    status === "undelivered" ||
    status === "canceled"
  ) {
    return "failed";
  }
  return "queued";
}

export function twilioWebhookUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  const publicBase = process.env.PUBLIC_APP_URL;
  if (!publicBase) return request.url;
  const publicUrl = new URL(requestUrl.pathname + requestUrl.search, publicBase);
  return publicUrl.toString();
}

function publicStatusCallbackUrl(): string | undefined {
  const publicBase = process.env.PUBLIC_APP_URL;
  return publicBase
    ? new URL("/api/twilio/status", publicBase).toString()
    : undefined;
}

function twilioErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { code?: unknown; status?: unknown };
  if (typeof candidate.code === "number" || typeof candidate.code === "string") {
    return String(candidate.code).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  }
  if (typeof candidate.status === "number") return `http_${candidate.status}`;
  return "unknown_error";
}

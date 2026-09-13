import {
  updateCustomerMessageStatusBySid,
} from "@/lib/customer-communication-store";
import {
  normalizeTwilioMessageStatus,
  twilioWebhookUrl,
  validateTwilioWebhookSignature,
} from "@/services/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const formData = new URLSearchParams(rawBody);
  const form = Object.fromEntries(formData.entries());
  const validSignature = validateTwilioWebhookSignature({
    signature: request.headers.get("x-twilio-signature"),
    url: twilioWebhookUrl(request),
    form,
  });
  if (!validSignature) {
    return new Response("Invalid Twilio signature.", { status: 401 });
  }

  const messageSid = form.MessageSid;
  const messageStatus = form.MessageStatus;
  if (messageSid && messageStatus) {
    updateCustomerMessageStatusBySid(
      messageSid,
      normalizeTwilioMessageStatus(messageStatus),
      form.ErrorCode?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
    );
  }
  return new Response(null, { status: 204 });
}

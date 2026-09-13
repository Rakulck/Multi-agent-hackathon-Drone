import { NextResponse } from "next/server";
import { z } from "zod";
import {
  beginCustomerChoiceWait,
  getActiveDeliveryChoiceToken,
  getMissionCommunication,
  getMissionMessageContext,
  requestCommunicationOperatorReview,
  reserveCustomerMessageEvent,
  saveDeliveryChoiceToken,
  updateCustomerMessageEvent,
} from "@/lib/customer-communication-store";
import { createDeliveryChoiceToken } from "@/lib/delivery-choice-token";
import {
  buildCustomerMessage,
  hasTwilioConfiguration,
  sendTwilioCustomerUpdate,
  TwilioMessageError,
} from "@/services/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  altitude: z.number().finite(),
});

const safetyContextSchema = z.object({
  primaryPoint: pointSchema,
  blockedZones: z
    .array(
      z.object({
        center: pointSchema,
        radiusM: z.number().finite().min(0).max(5_000),
      }),
    )
    .max(20),
  routeEligible: z.boolean(),
  weatherSafe: z.boolean(),
  batteryReservePercent: z.number().finite().min(0).max(100),
});

const messageSchema = z.object({
  missionId: z.string().min(1).max(100),
  eventType: z.enum([
    "DISPATCHED_TO_PICKUP",
    "PACKAGE_PICKED_UP",
    "APPROACHING_DESTINATION",
    "ALTERNATE_DROPOFF_REQUIRED",
    "DELIVERED",
  ]),
  eta: z.string().min(1).max(40).optional(),
  safetyContext: safetyContextSchema.optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Customer update request body was invalid.");
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest("Customer update fields were invalid.");
  }
  if (
    parsed.data.eventType === "ALTERNATE_DROPOFF_REQUIRED" &&
    !parsed.data.safetyContext
  ) {
    return invalidRequest(
      "Deterministic safety context is required for an alternate drop-off request.",
    );
  }

  const messageContext = getMissionMessageContext(parsed.data.missionId);
  if (!messageContext) {
    return NextResponse.json(
      { state: "NOT_FOUND", message: "Mission communication was not registered." },
      { status: 404 },
    );
  }
  const secureLink =
    parsed.data.eventType === "ALTERNATE_DROPOFF_REQUIRED"
      ? buildDeliveryChoiceLink(
          parsed.data.missionId,
          messageContext.customerIdentifier,
        )
      : undefined;
  const bodyText = buildCustomerMessage({
    eventType: parsed.data.eventType,
    missionId: parsed.data.missionId,
    primaryDropOffName: messageContext.primaryDropOffName,
    finalDropOffName: messageContext.finalDropOffName,
    eta: parsed.data.eta,
    secureLink,
  });
  const reservation = reserveCustomerMessageEvent(
    parsed.data.missionId,
    parsed.data.eventType,
  );
  if (!reservation) {
    return NextResponse.json(
      { state: "NOT_FOUND", message: "Mission communication was not registered." },
      { status: 404 },
    );
  }
  if (reservation.duplicate) {
    return NextResponse.json({
      communication: getMissionCommunication(parsed.data.missionId),
      event: reservation.event,
      duplicate: true,
      displayMessage: bodyText,
    });
  }

  if (!messageContext.recipientE164 || !hasTwilioConfiguration()) {
    return failedResult(
      parsed.data.missionId,
      parsed.data.eventType,
      "configuration_missing",
      bodyText,
    );
  }
  if (
    parsed.data.eventType === "ALTERNATE_DROPOFF_REQUIRED" &&
    !secureLink
  ) {
    return failedResult(
      parsed.data.missionId,
      parsed.data.eventType,
      "choice_link_unavailable",
      bodyText,
    );
  }

  try {
    const sent = await sendTwilioCustomerUpdate({
      to: messageContext.recipientE164,
      body: bodyText,
    });
    const event = updateCustomerMessageEvent({
      missionId: parsed.data.missionId,
      eventType: parsed.data.eventType,
      messageSid: sent.messageSid,
      status: sent.status,
      transport: "TWILIO",
    });
    if (
      parsed.data.eventType === "ALTERNATE_DROPOFF_REQUIRED" &&
      sent.status !== "failed"
    ) {
      beginCustomerChoiceWait(
        parsed.data.missionId,
        parsed.data.safetyContext!,
      );
    }
    console.info(
      "[twilio]",
      JSON.stringify({
        missionId: parsed.data.missionId,
        eventType: parsed.data.eventType,
        status: sent.status,
      }),
    );
    return NextResponse.json({
      communication: getMissionCommunication(parsed.data.missionId),
      event,
      duplicate: false,
      displayMessage: bodyText,
    });
  } catch (error) {
    const code =
      error instanceof TwilioMessageError ? error.safeCode : "unknown_error";
    return failedResult(
      parsed.data.missionId,
      parsed.data.eventType,
      code,
      bodyText,
    );
  }
}

function buildDeliveryChoiceLink(
  missionId: string,
  customerIdentifier: string | null,
): string | undefined {
  if (!customerIdentifier) return undefined;
  const publicBase = validPublicAppUrl();
  if (!publicBase) return undefined;
  let token = getActiveDeliveryChoiceToken(missionId);
  if (!token) {
    token = createDeliveryChoiceToken({
      missionId,
      customerId: customerIdentifier,
    });
    if (
      !token ||
      !saveDeliveryChoiceToken({
        missionId,
        token: token.token,
        expiresAt: token.expiresAt,
      })
    ) {
      return undefined;
    }
  }
  return new URL(
    `/delivery-choice/${encodeURIComponent(token.token)}`,
    publicBase,
  ).toString();
}

function validPublicAppUrl() {
  const value = process.env.PUBLIC_APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function failedResult(
  missionId: string,
  eventType: z.infer<typeof messageSchema>["eventType"],
  errorCode: string,
  displayMessage: string,
) {
  const event = updateCustomerMessageEvent({
    missionId,
    eventType,
    status: "failed",
    transport: "DEMO_FALLBACK",
    errorCode,
  });
  if (eventType === "ALTERNATE_DROPOFF_REQUIRED") {
    requestCommunicationOperatorReview(missionId);
  }
  console.error(
    "[twilio]",
    JSON.stringify({ missionId, eventType, status: "failed", errorCode }),
  );
  return NextResponse.json({
    communication: getMissionCommunication(missionId),
    event,
    duplicate: false,
    displayMessage,
    message:
      "DEMO_FALLBACK: no Twilio message was represented as sent; operator review is required when safety depends on a reply.",
  });
}

function invalidRequest(message: string) {
  return NextResponse.json(
    { state: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

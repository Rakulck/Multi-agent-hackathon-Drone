import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyOperatorApprovedFallback,
  getMissionCommunication,
  registerMissionCommunication,
} from "@/lib/customer-communication-store";
import { resolveTwilioRecipient } from "@/services/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  altitude: z.number().finite(),
});

const registrationSchema = z.object({
  missionId: z.string().min(1).max(100),
  useDemoRecipient: z.boolean(),
  recipientPhone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  primaryDropOffName: z.string().min(1).max(300),
  alternatives: z.tuple([
    z.object({ name: z.literal("Terrace"), point: pointSchema }),
    z.object({ name: z.literal("Front Entrance"), point: pointSchema }),
  ]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Mission communication request body was invalid.");
  }
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(
      "Mission communication fields or recipient E.164 number were invalid.",
    );
  }
  if (!parsed.data.useDemoRecipient && !parsed.data.recipientPhone) {
    return invalidRequest("A recipient E.164 number is required.");
  }

  const resolved = resolveTwilioRecipient(parsed.data);
  const recipientE164 =
    resolved && /^\+[1-9]\d{7,14}$/.test(resolved) ? resolved : null;
  const communication = registerMissionCommunication({
    missionId: parsed.data.missionId,
    recipientE164,
    primaryDropOffName: parsed.data.primaryDropOffName,
    alternatives: parsed.data.alternatives,
  });

  return NextResponse.json({
    communication,
    configured: Boolean(recipientE164),
    message: recipientE164
      ? "Customer communication registered."
      : "DEMO_FALLBACK: no valid server-side demo recipient is configured.",
  });
}

export async function GET(request: Request) {
  const missionId = new URL(request.url).searchParams.get("missionId");
  if (!missionId) return invalidRequest("missionId is required.");
  const communication = getMissionCommunication(missionId);
  if (!communication) {
    return NextResponse.json(
      { state: "NOT_FOUND", message: "Mission communication was not found." },
      { status: 404 },
    );
  }
  return NextResponse.json(communication, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Mission communication update body was invalid.");
  }
  const parsed = z
    .object({
      missionId: z.string().min(1).max(100),
      finalDropOffName: z.enum(["Terrace", "Front Entrance"]),
      source: z.literal("OPERATOR_DEMO_FALLBACK"),
    })
    .safeParse(body);
  if (!parsed.success) {
    return invalidRequest("Mission communication update was invalid.");
  }
  const communication = applyOperatorApprovedFallback(
    parsed.data.missionId,
    parsed.data.finalDropOffName,
  );
  if (!communication) {
    return NextResponse.json(
      { state: "NOT_FOUND", message: "Mission communication was not found." },
      { status: 404 },
    );
  }
  return NextResponse.json(communication);
}

function invalidRequest(message: string) {
  return NextResponse.json(
    { state: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

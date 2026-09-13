import { after } from "next/server";
import { z } from "zod";
import { applyCustomerAlternativeSelection } from "@/lib/customer-communication-store";
import { verifyDeliveryChoiceToken } from "@/lib/delivery-choice-token";
import { sendSlackOperatorAlert } from "@/services/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const selectionSchema = z.object({
  selection: z.enum(["Terrace", "Front Entrance"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ secureToken: string }> },
) {
  const { secureToken } = await context.params;
  const verification = verifyDeliveryChoiceToken(secureToken);
  if (!verification.ok) {
    return Response.json(
      {
        state: verification.reason,
        message:
          verification.reason === "EXPIRED"
            ? "This delivery-choice link has expired."
            : "This delivery-choice link is invalid.",
      },
      { status: verification.reason === "EXPIRED" ? 410 : 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) return invalidRequest();

  const result = applyCustomerAlternativeSelection({
    missionId: verification.payload.missionId,
    customerIdentifier: verification.payload.customerId,
    secureToken,
    selection: parsed.data.selection,
  });
  if (result.status !== "ACCEPTED") {
    const duplicate = result.status === "DUPLICATE";
    return Response.json(
      {
        state: result.status,
        message: duplicate
          ? "A drop-off choice has already been submitted for this mission."
          : "This mission is no longer accepting a delivery choice.",
      },
      { status: duplicate ? 409 : result.status === "INVALID" ? 404 : 409 },
    );
  }

  if (result.decision === "UNSAFE") {
    after(async () => {
      try {
        await sendSlackOperatorAlert({
          missionId: result.snapshot.missionId,
          title: "Unsafe customer drop-off selection",
          reason: result.reason,
          recommendedAction:
            "Review a different deterministic-safe destination. Do not override the failed safety check.",
        });
      } catch {
        console.error(
          "[slack]",
          JSON.stringify({
            missionId: result.snapshot.missionId,
            eventType: "UNSAFE_CUSTOMER_ALTERNATIVE",
            status: "failed",
          }),
        );
      }
    });
  }

  return Response.json({
    state: result.decision,
    message:
      result.decision === "SAFE"
        ? "Drop-off updated. You may close this page."
        : "This drop-off could not be accepted. The drone remains holding while an operator reviews the mission.",
    communication: result.snapshot,
  });
}

function invalidRequest() {
  return Response.json(
    { state: "INVALID_REQUEST", message: "Select a valid drop-off option." },
    { status: 400 },
  );
}

import type { Metadata } from "next";
import {
  DeliveryChoiceForm,
  DeliveryChoiceUnavailable,
} from "@/components/delivery-choice/delivery-choice-form";
import { getDeliveryChoiceMissionState } from "@/lib/customer-communication-store";
import { verifyDeliveryChoiceToken } from "@/lib/delivery-choice-token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose Delivery Drop-off",
  robots: { index: false, follow: false },
};

export default async function DeliveryChoicePage({
  params,
}: {
  params: Promise<{ secureToken: string }>;
}) {
  const { secureToken } = await params;
  const verification = verifyDeliveryChoiceToken(secureToken);
  if (!verification.ok) {
    return (
      <DeliveryChoiceUnavailable
        message={
          verification.reason === "EXPIRED"
            ? "This secure delivery-choice link has expired."
            : "This secure delivery-choice link is invalid."
        }
      />
    );
  }

  const communication = getDeliveryChoiceMissionState({
    missionId: verification.payload.missionId,
    customerIdentifier: verification.payload.customerId,
    secureToken,
  });
  if (!communication) {
    return (
      <DeliveryChoiceUnavailable message="This delivery-choice request is no longer available." />
    );
  }
  if (communication.replyReceived) {
    return (
      <DeliveryChoiceUnavailable message="A drop-off choice has already been submitted for this mission." />
    );
  }
  if (!communication.waitingForReply) {
    return (
      <DeliveryChoiceUnavailable message="This mission is not currently accepting a drop-off choice." />
    );
  }

  return (
    <DeliveryChoiceForm
      currentStatus="HOLD — awaiting your selection"
      missionId={communication.missionId}
      secureToken={secureToken}
    />
  );
}

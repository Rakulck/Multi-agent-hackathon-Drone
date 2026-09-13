import type { CustomerMessageEventType } from "@/types/domain";

export function buildCustomerMessage(params: {
  eventType: CustomerMessageEventType;
  missionId: string;
  primaryDropOffName: string;
  finalDropOffName: string;
  eta?: string;
  secureLink?: string;
}): string {
  const missionId = sanitizeMessageValue(params.missionId, 100);
  const primaryDropOffName = sanitizeMessageValue(
    params.primaryDropOffName,
    300,
  );
  const finalDropOffName = sanitizeMessageValue(params.finalDropOffName, 100);
  const eta = sanitizeMessageValue(params.eta ?? "soon", 40);
  const secureLink = sanitizeMessageValue(params.secureLink ?? "", 500);
  switch (params.eventType) {
    case "DISPATCHED_TO_PICKUP":
      return "Your delivery drone has been dispatched to the pickup location.";
    case "PACKAGE_PICKED_UP":
      return "Your package has been collected. The drone is now en route.";
    case "APPROACHING_DESTINATION":
      return `Your drone is approaching ${primaryDropOffName}. ETA: ${eta}.`;
    case "ALTERNATE_DROPOFF_REQUIRED":
      return secureLink
        ? `Your original drop-off is unavailable. Choose a safe alternative: ${secureLink}`
        : "Your original drop-off is unavailable. Secure choice link unavailable.";
    case "DELIVERED":
      return `Delivery completed at ${finalDropOffName}. Mission ID: ${missionId}.`;
  }
}

function sanitizeMessageValue(value: string, maximumLength: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

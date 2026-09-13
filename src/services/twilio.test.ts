import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildCustomerMessage,
  normalizeTwilioMessageStatus,
} from "@/services/twilio";

const base = {
  missionId: "mission-123",
  primaryDropOffName: "Courtyard at Riverside Apartments",
  finalDropOffName: "Terrace",
};

describe("Twilio customer update messages", () => {
  it("builds the dispatch update", () => {
    expect(
      buildCustomerMessage({ ...base, eventType: "DISPATCHED_TO_PICKUP" }),
    ).toBe(
      "Your delivery drone has been dispatched to the pickup location.",
    );
  });

  it("builds the pickup and en-route update", () => {
    expect(
      buildCustomerMessage({ ...base, eventType: "PACKAGE_PICKED_UP" }),
    ).toBe("Your package has been collected. The drone is now en route.");
  });

  it("builds the approaching update from the mission drop-off name", () => {
    expect(
      buildCustomerMessage({
        ...base,
        eventType: "APPROACHING_DESTINATION",
        eta: "3 min",
      }),
    ).toBe(
      "Your drone is approaching Courtyard at Riverside Apartments. ETA: 3 min.",
    );
  });

  it("builds the blocked drop-off question", () => {
    expect(
      buildCustomerMessage({
        ...base,
        eventType: "ALTERNATE_DROPOFF_REQUIRED",
        secureLink: "https://delivery.example/delivery-choice/signed-token",
      }),
    ).toBe(
      "Your original drop-off is unavailable. Choose a safe alternative: https://delivery.example/delivery-choice/signed-token",
    );
  });

  it("builds the successful delivery confirmation", () => {
    expect(
      buildCustomerMessage({ ...base, eventType: "DELIVERED" }),
    ).toBe(
      "Delivery completed at Terrace. Mission ID: mission-123.",
    );
  });

  it("sanitizes dynamic values before sending and displaying them", () => {
    expect(
      buildCustomerMessage({
        ...base,
        eventType: "APPROACHING_DESTINATION",
        primaryDropOffName: "Courtyard\n at\tRiverside",
        eta: "3\nmin",
      }),
    ).toBe("Your drone is approaching Courtyard at Riverside. ETA: 3 min.");
  });

  it("normalizes Twilio delivery states for the dashboard", () => {
    expect(normalizeTwilioMessageStatus("accepted")).toBe("queued");
    expect(normalizeTwilioMessageStatus("sent")).toBe("sent");
    expect(normalizeTwilioMessageStatus("delivered")).toBe("delivered");
    expect(normalizeTwilioMessageStatus("undelivered")).toBe("failed");
  });
});

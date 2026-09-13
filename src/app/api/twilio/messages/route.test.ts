import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTwilioCustomerUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/twilio", () => ({
  buildCustomerMessage: vi.fn(
    (params: { secureLink?: string }) =>
      params.secureLink
        ? `Choose a safe alternative: ${params.secureLink}`
        : "Safe test message",
  ),
  hasTwilioConfiguration: vi.fn(() => true),
  sendTwilioCustomerUpdate: mocks.sendTwilioCustomerUpdate,
  TwilioMessageError: class TwilioMessageError extends Error {
    safeCode = "test_error";
  },
}));

import {
  registerMissionCommunication,
  resetCustomerCommunicationStoreForTests,
} from "@/lib/customer-communication-store";
import { POST } from "./route";

describe("POST /api/twilio/messages", () => {
  beforeEach(() => {
    process.env.PUBLIC_APP_URL = "https://delivery.example";
    process.env.DELIVERY_CHOICE_SIGNING_SECRET = "test-signing-secret";
    resetCustomerCommunicationStoreForTests();
    mocks.sendTwilioCustomerUpdate.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    register();
  });

  it("prevents duplicate messages by missionId and eventType", async () => {
    mocks.sendTwilioCustomerUpdate.mockResolvedValue({
      messageSid: "SM_DISPATCH",
      status: "queued",
    });

    const first = await POST(request("DISPATCHED_TO_PICKUP"));
    const second = await POST(request("DISPATCHED_TO_PICKUP"));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.duplicate).toBe(false);
    expect(secondBody.duplicate).toBe(true);
    expect(firstBody.event.messageSid).toBe("SM_DISPATCH");
    expect(mocks.sendTwilioCustomerUpdate).toHaveBeenCalledOnce();
  });

  it("records a Twilio API failure without throwing a mission error", async () => {
    mocks.sendTwilioCustomerUpdate.mockRejectedValue(
      new Error("provider unavailable"),
    );

    const response = await POST(request("PACKAGE_PICKED_UP"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.event.status).toBe("failed");
    expect(body.event.transport).toBe("DEMO_FALLBACK");
    expect(body.event.messageSid).toBeNull();
  });

  it("keeps HOLD and requests operator review when the question fails", async () => {
    mocks.sendTwilioCustomerUpdate.mockRejectedValue(
      new Error("provider unavailable"),
    );

    const response = await POST(
      request("ALTERNATE_DROPOFF_REQUIRED", {
        primaryPoint: point(0),
        blockedZones: [{ center: point(0), radiusM: 25 }],
        routeEligible: true,
        weatherSafe: true,
        batteryReservePercent: 60,
      }),
    );
    const body = await response.json();

    expect(body.communication.waitingForReply).toBe(false);
    expect(body.communication.operatorReviewRequested).toBe(true);
    expect(body.message).toContain("DEMO_FALLBACK");
  });

  it("sends a secure web-choice link and starts the customer wait", async () => {
    mocks.sendTwilioCustomerUpdate.mockResolvedValue({
      messageSid: "SM_CHOICE",
      status: "queued",
    });

    const response = await POST(
      request("ALTERNATE_DROPOFF_REQUIRED", {
        primaryPoint: point(0),
        blockedZones: [{ center: point(0), radiusM: 25 }],
        routeEligible: true,
        weatherSafe: true,
        batteryReservePercent: 60,
      }),
    );
    const body = await response.json();

    expect(body.communication.waitingForReply).toBe(true);
    expect(body.displayMessage).toContain(
      "https://delivery.example/delivery-choice/",
    );
    expect(mocks.sendTwilioCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("/delivery-choice/"),
      }),
    );
  });
});

function register() {
  registerMissionCommunication({
    missionId: "mission-test",
    recipientE164: "+14155550123",
    primaryDropOffName: "Courtyard at Test Destination",
    alternatives: [
      { name: "Terrace", point: point(0.001) },
      { name: "Front Entrance", point: point(0.002) },
    ],
  });
}

function request(
  eventType:
    | "DISPATCHED_TO_PICKUP"
    | "PACKAGE_PICKED_UP"
    | "ALTERNATE_DROPOFF_REQUIRED",
  safetyContext?: {
    primaryPoint: ReturnType<typeof point>;
    blockedZones: Array<{
      center: ReturnType<typeof point>;
      radiusM: number;
    }>;
    routeEligible: boolean;
    weatherSafe: boolean;
    batteryReservePercent: number;
  },
) {
  return new Request("http://localhost/api/twilio/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ missionId: "mission-test", eventType, safetyContext }),
  });
}

function point(offset: number) {
  return { lat: 37.78 + offset, lng: -122.4, altitude: 90 };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  sendSlackOperatorAlert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<void>) => void callback(),
  };
});
vi.mock("@/services/slack", () => ({
  sendSlackOperatorAlert: mocks.sendSlackOperatorAlert,
}));

import {
  beginCustomerChoiceWait,
  getMissionCommunication,
  registerMissionCommunication,
  resetCustomerCommunicationStoreForTests,
  saveDeliveryChoiceToken,
} from "@/lib/customer-communication-store";
import { createDeliveryChoiceToken } from "@/lib/delivery-choice-token";
import { POST } from "./route";

describe("POST /api/delivery-choice/[secureToken]", () => {
  beforeEach(() => {
    process.env.DELIVERY_CHOICE_SIGNING_SECRET = "choice-route-test-secret";
    resetCustomerCommunicationStoreForTests();
    mocks.sendSlackOperatorAlert.mockReset();
  });

  afterEach(() => {
    delete process.env.DELIVERY_CHOICE_SIGNING_SECRET;
  });

  it("accepts a safe choice exactly once", async () => {
    const token = prepareChoice();

    const response = await POST(choiceRequest("Terrace"), context(token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe("SAFE");
    expect(body.message).toBe(
      "Drop-off updated. You may close this page.",
    );
    expect(
      getMissionCommunication("mission-choice")?.updatedDropOff,
    ).toBe("Terrace");

    const duplicate = await POST(choiceRequest("Terrace"), context(token));
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).state).toBe("DUPLICATE");
  });

  it("keeps an unsafe choice holding and requests Slack review", async () => {
    const frontEntrance = point(0.002);
    const token = prepareChoice([
      { center: frontEntrance, radiusM: 30 },
    ]);

    const response = await POST(
      choiceRequest("Front Entrance"),
      context(token),
    );
    const body = await response.json();

    expect(body.state).toBe("UNSAFE");
    expect(
      getMissionCommunication("mission-choice")?.updatedDropOff,
    ).toBeNull();
    expect(
      getMissionCommunication("mission-choice")?.operatorReviewRequested,
    ).toBe(true);
    expect(mocks.sendSlackOperatorAlert).toHaveBeenCalledOnce();
  });

  it("rejects an expired selection token", async () => {
    const token = prepareChoice(
      [{ center: point(0), radiusM: 25 }],
      Date.now() - 5 * 60 * 1_000 - 1,
    );

    const response = await POST(choiceRequest("Terrace"), context(token));

    expect(response.status).toBe(410);
    expect((await response.json()).state).toBe("EXPIRED");
  });
});

function prepareChoice(
  blockedZones: Array<{
    center: ReturnType<typeof point>;
    radiusM: number;
  }> = [{ center: point(0), radiusM: 25 }],
  now = Date.now(),
) {
  registerMissionCommunication({
    missionId: "mission-choice",
    recipientE164: "+14155550123",
    primaryDropOffName: "Courtyard at Test Destination",
    alternatives: [
      { name: "Terrace", point: point(0.001) },
      { name: "Front Entrance", point: point(0.002) },
    ],
  });
  beginCustomerChoiceWait("mission-choice", {
    primaryPoint: point(0),
    blockedZones,
    routeEligible: true,
    weatherSafe: true,
    batteryReservePercent: 55,
  });
  const created = createDeliveryChoiceToken({
    missionId: "mission-choice",
    customerId: customerId(),
    now,
  })!;
  saveDeliveryChoiceToken({
    missionId: "mission-choice",
    token: created.token,
    expiresAt: created.expiresAt,
  });
  return created.token;
}

function choiceRequest(selection: "Terrace" | "Front Entrance") {
  return new Request("https://delivery.example/api/delivery-choice/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selection }),
  });
}

function context(secureToken: string) {
  return { params: Promise.resolve({ secureToken }) };
}

function customerId() {
  return createHash("sha256")
    .update("+14155550123")
    .digest("hex")
    .slice(0, 24);
}

function point(offset: number) {
  return { lat: 37.78 + offset, lng: -122.4, altitude: 90 };
}

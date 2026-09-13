import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalMemory } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  createAirtableMemoryRecord: vi.fn(),
  updateSlackApprovalMessage: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => {
    void callback();
  }),
}));

vi.mock("@/services/airtable", () => ({
  createAirtableMemoryRecord: mocks.createAirtableMemoryRecord,
}));

vi.mock("@/services/slack", () => ({
  updateSlackApprovalMessage: mocks.updateSlackApprovalMessage,
}));

import {
  createApprovalRecord,
  getApprovalRecord,
  markApprovalPending,
  resetApprovalStoreForTests,
} from "@/lib/slack-approval-store";
import { POST } from "./route";

const signingSecret = "test-signing-secret";

describe("POST /api/slack/interactions live obstacle actions", () => {
  beforeEach(() => {
    resetApprovalStoreForTests();
    mocks.createAirtableMemoryRecord.mockReset();
    mocks.updateSlackApprovalMessage.mockReset().mockResolvedValue(undefined);
    process.env.SLACK_SIGNING_SECRET = signingSecret;
  });

  it("approves an altitude adjustment, persists memory once, and ignores duplicate clicks", async () => {
    const requestId = pendingLiveObstacleApproval();
    mocks.createAirtableMemoryRecord.mockImplementation(
      async (memory: OperationalMemory) => ({
        status: "SUCCESS",
        memories: [{ ...memory, airtableStatus: "saved" }],
        message: `Memory ${memory.id} saved to Airtable.`,
        source: "AIRTABLE",
        duplicate: false,
      }),
    );

    expect((await POST(slackRequest("adjust_altitude", requestId))).status).toBe(200);
    expect((await POST(slackRequest("adjust_altitude", requestId))).status).toBe(200);

    const record = getApprovalRecord(requestId);
    expect(mocks.createAirtableMemoryRecord).toHaveBeenCalledOnce();
    expect(record?.status).toBe("APPROVED");
    expect(record?.memoryWriteStatus).toBe("SAVED");
    expect(record?.memory?.verificationStatus).toBe("Human Verified");
    expect(record?.memory?.verifiedBy).toBe("Test Operator");
    expect(record?.mitigation).toBe("ADJUST_ALTITUDE");
  });

  it("records the operator's alternate-route choice", async () => {
    const requestId = pendingLiveObstacleApproval();
    mocks.createAirtableMemoryRecord.mockImplementation(
      async (memory: OperationalMemory) => ({
        status: "SUCCESS",
        memories: [{ ...memory, airtableStatus: "saved" }],
        message: `Memory ${memory.id} saved to Airtable.`,
        source: "AIRTABLE",
        duplicate: false,
      }),
    );

    expect((await POST(slackRequest("choose_alternate_route", requestId))).status).toBe(200);
    expect(getApprovalRecord(requestId)?.mitigation).toBe(
      "CHOOSE_ALTERNATE_ROUTE",
    );
  });

  it("keeps holding without creating active memory", async () => {
    const requestId = pendingLiveObstacleApproval();

    expect((await POST(slackRequest("keep_holding", requestId))).status).toBe(200);

    const record = getApprovalRecord(requestId);
    expect(record?.status).toBe("HELD");
    expect(record?.memory).toBeUndefined();
    expect(mocks.createAirtableMemoryRecord).not.toHaveBeenCalled();
  });

  it("returns home without creating active memory", async () => {
    const requestId = pendingLiveObstacleApproval();

    expect((await POST(slackRequest("return_home", requestId))).status).toBe(200);

    const record = getApprovalRecord(requestId);
    expect(record?.status).toBe("REJECTED");
    expect(record?.memory).toBeUndefined();
    expect(mocks.createAirtableMemoryRecord).not.toHaveBeenCalled();
  });

  it("rejects an unsigned action without changing mission state", async () => {
    const requestId = pendingLiveObstacleApproval();
    const request = slackRequest("adjust_altitude", requestId);
    request.headers.set("x-slack-signature", "v0=invalid");

    expect((await POST(request)).status).toBe(401);
    expect(getApprovalRecord(requestId)?.status).toBe("PENDING");
    expect(mocks.createAirtableMemoryRecord).not.toHaveBeenCalled();
  });
});

function pendingLiveObstacleApproval() {
  const draft = memoryDraft();
  const { record } = createApprovalRecord(
    {
      idempotencyKey: `mission-1:live-crane:${draft.id}`,
      missionId: "mission-1",
      droneName: "Atlas HeavyLift",
      vendorName: "Atlas Robotics",
      approvalKind: "LIVE_OBSTACLE_REROUTE",
      currentStatus: "HOLD",
      coordinates: { lat: draft.latitude, lng: draft.longitude, altitudeM: 138 },
      reason: "Route A overlaps the crane in location and altitude.",
      risks: [
        {
          id: "live-crane",
          kind: "ROUTE_ADJUSTMENT",
          level: "CAUTION",
          riskDetected: "Construction crane intersects Route A.",
          currentValue: "Route A at 138 m",
          allowedLimit: "No obstacle overlap",
          agentRecommendation: "Adjust altitude or choose Route C.",
          proposedAdjustment: "Climb to 155 m.",
        },
      ],
      proposedAlternative: "Adjust altitude to 155 m or choose Route C",
      routeImpact: "Route A blocked",
      etaImpact: "ETA +1 minute",
      liveObstacle: {
        detectedObstacle: "CONSTRUCTION CRANE",
        geminiConfidence: 0.94,
        currentRoute: "A",
        recommendedRoute: "C",
        recommendedAltitudeM: 155,
        rejectionReason: "Route and altitude overlap.",
      },
      memoryDraft: draft,
    },
    true,
  );
  markApprovalPending(record.approval.requestId, {
    channelId: "C123",
    messageTs: "123.456",
  });
  return record.approval.requestId;
}

function memoryDraft(): OperationalMemory {
  return {
    id: "MEM-LIVE-CRANE",
    learnedBy: "Atlas HeavyLift",
    routeId: "A",
    hazardType: "CONSTRUCTION_CRANE",
    latitude: 37.79272,
    longitude: -122.3967,
    severity: "High",
    confidence: 0.94,
    createdAt: "2026-09-13T19:00:00.000Z",
    expiresAt: "2099-09-14T19:00:00.000Z",
    summary: "Crane blocks Route A.",
    altitudeBandM: [90, 148],
    avoidanceRadiusM: 120,
    sourceVendor: "Atlas Robotics",
    sourceMission: "mission-1",
    status: "Inactive",
    verificationStatus: "Awaiting Verification",
    dataSource: "AIRTABLE",
    airtableStatus: "draft",
  };
}

function slackRequest(
  actionId:
    | "adjust_altitude"
    | "choose_alternate_route"
    | "keep_holding"
    | "return_home",
  requestId: string,
) {
  const body = new URLSearchParams({
    payload: JSON.stringify({
      type: "block_actions",
      user: { id: "U123", name: "Test Operator" },
      actions: [{ action_id: actionId, value: requestId }],
    }),
  }).toString();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("http://localhost/api/slack/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });
}

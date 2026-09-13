import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeA } from "@/data/demo-routes";
import type {
  GeminiObstacleApiResponse,
  GeminiObstacleObservation,
} from "@/types/domain";

const mocks = vi.hoisted(() => ({
  analyzeObstacleWithGemini: vi.fn(),
}));

vi.mock("@/services/gemini", () => ({
  analyzeObstacleWithGemini: mocks.analyzeObstacleWithGemini,
}));

import { POST } from "./route";

const craneObservation: GeminiObstacleObservation = {
  obstacleDetected: true,
  obstacleType: "CONSTRUCTION_CRANE",
  description: "A tower crane crosses the active aerial corridor.",
  confidence: 0.94,
  estimatedCoordinates: {
    latitude: routeA[2].lat,
    longitude: routeA[2].lng,
  },
  minimumAltitudeM: 90,
  maximumAltitudeM: 148,
  recommendedMemoryTtlMinutes: 1_440,
};

describe("POST /api/gemini/obstacle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.analyzeObstacleWithGemini.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("validates a high-confidence crane but leaves memory pending approval", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue(success(craneObservation));

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(response.status).toBe(200);
    expect(body.decision.action).toBe("REROUTE");
    expect(body.decision.altitudeOverlap).toBe(true);
    expect(body.memorySaveStatus).toBe("AWAITING_APPROVAL");
    expect(body.memory?.status).toBe("Inactive");
    expect(body.memory?.verificationStatus).toBe("Awaiting Verification");
  });

  it("continues and does not save memory when no obstacle is detected", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue(
      success({
        ...craneObservation,
        obstacleDetected: false,
        description: "No obstacle is visible in the active corridor.",
        confidence: 0.99,
      }),
    );

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(body.decision.action).toBe("CONTINUE");
    expect(body.memorySaveStatus).toBe("NOT_APPLICABLE");
  });

  it("holds for Slack human review on low confidence", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue(
      success({ ...craneObservation, confidence: 0.61 }),
    );

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(body.decision.action).toBe("HOLD_FOR_HUMAN_REVIEW");
    expect(body.decision.relevantForMemory).toBe(false);
  });

  it("fails closed when Gemini returns malformed output", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue({
      ok: false,
      model: "gemini-test",
      latencyMs: 12,
      schemaValidation: false,
      failureKind: "INVALID_RESPONSE",
      message: "GEMINI_API_FAILURE: Gemini output failed schema validation.",
    });

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(response.status).toBe(502);
    expect(body.status).toBe("GEMINI_API_FAILURE");
    expect(body.schemaValidation).toBe(false);
    expect(body.decision.action).toBe("GEMINI_API_FAILURE");
  });

  it("fails closed with a timeout response", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue({
      ok: false,
      model: "gemini-test",
      latencyMs: 10_000,
      schemaValidation: false,
      failureKind: "TIMEOUT",
      message: "GEMINI_API_FAILURE: Gemini obstacle analysis timed out.",
    });

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(response.status).toBe(504);
    expect(body.decision.action).toBe("GEMINI_API_FAILURE");
    expect(body.memory).toBeNull();
  });

  it("fails closed on a Gemini API error", async () => {
    mocks.analyzeObstacleWithGemini.mockResolvedValue({
      ok: false,
      model: "gemini-test",
      latencyMs: 30,
      schemaValidation: false,
      failureKind: "API_FAILURE",
      message: "GEMINI_API_FAILURE: Gemini obstacle analysis failed.",
    });

    const response = await POST(makeRequest());
    const body = (await response.json()) as GeminiObstacleApiResponse;

    expect(response.status).toBe(502);
    expect(body.decision.action).toBe("GEMINI_API_FAILURE");
  });
});

function success(observation: GeminiObstacleObservation) {
  return {
    ok: true as const,
    source: "GEMINI" as const,
    model: "gemini-test",
    latencyMs: 25,
    schemaValidation: true as const,
    observation,
  };
}

function makeRequest() {
  return new Request("http://localhost/api/gemini/obstacle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "LIVE",
      missionId: "mission-test",
      droneId: "Atlas HeavyLift",
      sourceVendor: "Atlas",
      currentRoute: "A",
      droneCoordinates: {
        latitude: routeA[2].lat,
        longitude: routeA[2].lng,
      },
      altitudeM: routeA[2].altitude,
      routeWaypoints: routeA,
    }),
  });
}

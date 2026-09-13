import { describe, expect, it } from "vitest";
import { makeDemoWeather } from "@/data/demo-weather";
import { sharedDemoCorridor } from "@/lib/map/route-warp";
import {
  buildApprovalStepEvidence,
  createMission,
  demoPresetInputs,
  deriveFlightMode,
  evaluateAirspaceForMission,
  evaluateFleetForMission,
  evaluateMemoriesAgainstRoutes,
  evaluateMissionRiskReview,
  evaluateRoutesForMission,
  evaluateWeatherForDrones,
  fleetSnapshotForPreflight,
  makeInitialFleet,
} from "@/lib/mission-machine";
import type { OperationalMemory } from "@/types/domain";

describe("controlled two-mission demo", () => {
  it("completes Mission 1 preflight without Slack and selects Route A", () => {
    const mission = createMission(demoPresetInputs.MISSION_1, "MISSION_1", {
      isDemoPreset: true,
    });
    const fleetRows = evaluateFleetForMission(
      fleetSnapshotForPreflight(makeInitialFleet(), "MISSION_1"),
      mission.input.weightKg,
      mission.input.deliveryType,
    );
    const weather = makeDemoWeather("SAFE");
    const weatherEvaluation = evaluateWeatherForDrones(fleetRows, weather);
    const airspaceEval = evaluateAirspaceForMission(null, {
      controlledDemoPreset: true,
    });
    const routeResult = evaluateRoutesForMission(false, airspaceEval);
    const reviewedMission = {
      ...mission,
      fleetEligibility: fleetRows,
      confirmedDrone: weatherEvaluation.confirmedDrone?.model ?? null,
      weather,
      weatherEvaluation,
      cruiseSpeedMph: weatherEvaluation.cruiseSpeedMph,
      airspaceEval,
      routeEval: routeResult.rows,
      selectedRoute: routeResult.selectedRoute,
    };
    const review = evaluateMissionRiskReview(reviewedMission);
    const approval = buildApprovalStepEvidence(review);

    expect(mission.weatherMode).toBe("SAFE");
    expect(airspaceEval.authorizationRequired).toBe(false);
    expect(routeResult.selectedRoute).toBe("A");
    expect(review.level).toBe("SAFE");
    expect(approval.status).toBe("Completed");
    expect(approval.source).toContain("Slack not contacted");
  });

  it("places a newly detected live obstacle in zero-speed HOLD", () => {
    expect(
      deriveFlightMode({
        status: "OBSTACLE DETECTED",
        progress: 0.58,
        override: null,
      }),
    ).toBe("HOLD");
  });

  it.each([
    ["MISSION_1", "Atlas HeavyLift"],
    ["MISSION_2", "CargoSwift S2"],
  ] as const)(
    "requires a weather approval for %s in the Moderate scenario",
    (pattern, expectedDrone) => {
      const mission = createMission(demoPresetInputs[pattern], pattern, {
        isDemoPreset: true,
      });
      const fleetRows = evaluateFleetForMission(
        fleetSnapshotForPreflight(makeInitialFleet(), pattern),
        mission.input.weightKg,
        mission.input.deliveryType,
      );
      const weather = makeDemoWeather("MODERATE");
      const weatherEvaluation = evaluateWeatherForDrones(fleetRows, weather);
      const airspaceEval = evaluateAirspaceForMission(null, {
        controlledDemoPreset: pattern === "MISSION_1",
        routeCRequiresAuthorization: pattern === "MISSION_2",
      });
      const routes = evaluateRoutesForMission(false, airspaceEval);
      const review = evaluateMissionRiskReview({
        ...mission,
        fleetEligibility: fleetRows,
        confirmedDrone: weatherEvaluation.confirmedDrone?.model ?? null,
        weather,
        weatherEvaluation,
        cruiseSpeedMph: weatherEvaluation.cruiseSpeedMph,
        airspaceEval,
        routeEval: routes.rows,
        selectedRoute: routes.selectedRoute,
      });

      expect(weatherEvaluation.confirmedDrone?.model).toBe(expectedDrone);
      expect(
        review.conditions.some(
          (condition) => condition.kind === "WEATHER_MARGIN",
        ),
      ).toBe(true);
      expect(buildApprovalStepEvidence(review).status).toBe("Approval");
    },
  );

  it("requires preflight approval when Mission 2 changes from Route A to Route B", () => {
    const memory = verifiedMemory();
    const mission = createMission(demoPresetInputs.MISSION_2, "MISSION_2", {
      isDemoPreset: true,
    });
    const fleetRows = evaluateFleetForMission(
      fleetSnapshotForPreflight(makeInitialFleet(), "MISSION_2"),
      mission.input.weightKg,
      mission.input.deliveryType,
    );
    const weather = makeDemoWeather("SAFE");
    const weatherEvaluation = evaluateWeatherForDrones(fleetRows, weather);
    const airspaceEval = evaluateAirspaceForMission(null, {
      routeCRequiresAuthorization: true,
    });
    const memories = [{ ...memory, usedBy: "CargoSwift S2" }];
    const memoryMatches = evaluateMemoriesAgainstRoutes(
      memories,
      mission.mapScene.routes,
    );
    const routeResult = evaluateRoutesForMission(true, airspaceEval, memory.id);
    const reviewedMission = {
      ...mission,
      fleetEligibility: fleetRows,
      confirmedDrone: "CargoSwift S2",
      weather,
      weatherEvaluation,
      cruiseSpeedMph: weatherEvaluation.cruiseSpeedMph,
      memories,
      memoryMatches,
      airspaceEval,
      routeEval: routeResult.rows,
      selectedRoute: routeResult.selectedRoute,
    };
    const review = evaluateMissionRiskReview(reviewedMission);

    expect(routeResult.rows.find((route) => route.id === "A")?.status).toBe("blocked");
    expect(routeResult.rows.find((route) => route.id === "C")?.status).toBe("blocked");
    expect(routeResult.selectedRoute).toBe("B");
    expect(review.level).toBe("CAUTION");
    expect(
      review.conditions.some(
        (condition) => condition.id === "shared-memory-route-change",
      ),
    ).toBe(true);
    expect(buildApprovalStepEvidence(review).status).toBe("Approval");
    expect(buildApprovalStepEvidence(review).source).toContain("Slack");
  });
});

function verifiedMemory(): OperationalMemory {
  return {
    id: "MEM-MISSION-1-EXACT",
    learnedBy: "Atlas HeavyLift",
    usedBy: "CargoSwift S2",
    routeId: "A",
    hazardType: "CONSTRUCTION_CRANE",
    latitude: sharedDemoCorridor.waypoints[1].lat,
    longitude: sharedDemoCorridor.waypoints[1].lng,
    severity: "High",
    confidence: 0.94,
    createdAt: "2026-09-13T19:00:00.000Z",
    expiresAt: "2099-09-14T19:00:00.000Z",
    summary: "Human-verified crane blocks Route A.",
    altitudeBandM: [90, 148],
    avoidanceRadiusM: 120,
    sourceVendor: "Atlas Robotics",
    sourceMission: "mission-1",
    status: "Active",
    verificationStatus: "Human Verified",
    verifiedAt: "2026-09-13T19:01:00.000Z",
    verifiedBy: "Safety Operator",
    dataSource: "AIRTABLE",
    airtableStatus: "saved",
  };
}

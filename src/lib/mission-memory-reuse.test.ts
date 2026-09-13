import { describe, expect, it } from "vitest";
import { sharedDemoCorridor } from "@/lib/map/route-warp";
import {
  buildMemoryStepEvidence,
  createMission,
  demoPresetInputs,
  evaluateMemoriesAgainstRoutes,
  evaluateAirspaceForMission,
  evaluateRoutesForMission,
  markMemoryUsed,
} from "@/lib/mission-machine";
import type { MemoryApiResponse, OperationalMemory } from "@/types/domain";

describe("Mission 2 shared-memory reuse", () => {
  const mission1 = createMission(demoPresetInputs.MISSION_1, "MISSION_1", {
    isDemoPreset: true,
  });
  const mission2 = createMission(demoPresetInputs.MISSION_2, "MISSION_2", {
    isDemoPreset: true,
  });

  it("uses different origins and destinations with an exact shared middle corridor", () => {
    expect(mission1.mapScene.origin).not.toEqual(mission2.mapScene.origin);
    expect(mission1.mapScene.destination).not.toEqual(mission2.mapScene.destination);
    expect(mission1.input.pickup).not.toBe(mission2.input.pickup);
    expect(mission1.input.drop).not.toBe(mission2.input.drop);

    const mission1A = mission1.mapScene.routes.find((route) => route.id === "A")!;
    const mission2A = mission2.mapScene.routes.find((route) => route.id === "A")!;
    expect(mission1A.label).toBe("SF-FIDI-EMBARCADERO-NORTHBOUND");
    expect(mission2A.label).toBe("SF-FIDI-EMBARCADERO-NORTHBOUND");
    expect(mission1A.waypoints).toEqual(
      expect.arrayContaining(sharedDemoCorridor.waypoints),
    );
    expect(mission2A.waypoints).toEqual(
      expect.arrayContaining(sharedDemoCorridor.waypoints),
    );
  });

  it("reuses Atlas memory across unrelated mission IDs to reject Route A", () => {
    const createdByMission1 = makeMemory({
      id: "AIRTABLE-REC-MISSION-1",
      sourceMission: mission1.id,
    });
    const memory = markMemoryUsed(createdByMission1, "CargoSwift S2");
    const matches = evaluateMemoriesAgainstRoutes(
      [memory],
      mission2.mapScene.routes,
    );
    const routeABlocked = matches.some(
      (match) => match.routeId === "A" && match.matched,
    );
    const airspace = evaluateAirspaceForMission(null, {
      routeCRequiresAuthorization: true,
    });
    const routes = evaluateRoutesForMission(
      routeABlocked,
      airspace,
      memory.id,
    );

    expect(memory.learnedBy).toBe("Atlas HeavyLift");
    expect(memory.usedBy).toBe("CargoSwift S2");
    expect(memory.sourceMission).not.toBe(mission2.id);
    expect(routeABlocked).toBe(true);
    expect(
      matches.filter((match) => match.matched).map((match) => match.routeId),
    ).toEqual(["A"]);
    expect(routes.rows.find((route) => route.id === "A")?.status).toBe(
      "blocked",
    );
    expect(routes.rows.find((route) => route.id === "C")?.status).toBe("blocked");
    expect(routes.selectedRoute).toBe("B");
  });

  it("reuses the exact Airtable record created by Mission 1", () => {
    const created = makeMemory({
      id: "MEM-MISSION-1",
      airtableRecordId: "recMission1Exact",
      sourceMission: mission1.id,
    });
    const response: MemoryApiResponse = {
      status: "SUCCESS",
      memories: [created],
      message: "1 active verified memory loaded.",
      source: "AIRTABLE",
    };
    const retrieved = markMemoryUsed(response.memories[0], "CargoSwift S2");
    const matches = evaluateMemoriesAgainstRoutes(
      [retrieved],
      mission2.mapScene.routes,
    );

    expect(retrieved.id).toBe(created.id);
    expect(retrieved.airtableRecordId).toBe("recMission1Exact");
    expect(matches.some((match) => match.routeId === "A" && match.matched)).toBe(true);
  });

  it("continues on a successful empty Airtable result", () => {
    const response: MemoryApiResponse = {
      status: "SUCCESS_EMPTY",
      memories: [],
      message: "No relevant shared hazards found.",
      source: "AIRTABLE",
    };
    const evidence = buildMemoryStepEvidence({
      response,
      matches: [],
      retrievedBy: "CargoSwift S2",
    });

    expect(evidence.status).toBe("Completed");
    expect(evidence.decision).toBe("No relevant shared hazards found.");
  });

  it("keeps API failures fail-closed", () => {
    const response: MemoryApiResponse = {
      status: "API_FAILURE",
      memories: [],
      message: "Airtable could not be reached.",
      source: "AIRTABLE",
    };
    const evidence = buildMemoryStepEvidence({
      response,
      matches: [],
      retrievedBy: "CargoSwift S2",
    });

    expect(evidence.status).toBe("Approval");
    expect(evidence.decision).toContain("Mission paused");
  });

  it("ignores a verified memory outside every candidate corridor", () => {
    const distant = makeMemory({ latitude: 37.75, longitude: -122.45 });
    const matches = evaluateMemoriesAgainstRoutes(
      [distant],
      mission2.mapScene.routes,
    );

    expect(matches.every((match) => !match.matched)).toBe(true);
  });

  it("does not trust expired or unverified memories", () => {
    const expired = makeMemory({
      id: "MEM-EXPIRED",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const unverified = makeMemory({
      id: "MEM-UNVERIFIED",
      status: "Inactive",
      verificationStatus: "Awaiting Verification",
      verifiedAt: undefined,
      verifiedBy: undefined,
      airtableStatus: "draft",
    });

    expect(
      evaluateMemoriesAgainstRoutes(
        [expired, unverified],
        mission2.mapScene.routes,
      ),
    ).toEqual([]);
  });
});

function makeMemory(
  overrides: Partial<OperationalMemory> = {},
): OperationalMemory {
  return {
    id: "MEM-CRANE-TEST",
    learnedBy: "Atlas HeavyLift",
    routeId: "A",
    hazardType: "CONSTRUCTION_CRANE",
    latitude: sharedDemoCorridor.waypoints[1].lat,
    longitude: sharedDemoCorridor.waypoints[1].lng,
    severity: "High",
    confidence: 0.94,
    createdAt: "2026-09-13T19:00:00.000Z",
    expiresAt: "2099-09-14T19:00:00.000Z",
    summary: "Validated crane blocks Route A.",
    altitudeBandM: [90, 148],
    avoidanceRadiusM: 120,
    sourceVendor: "Atlas Robotics",
    sourceMission: "mission-1",
    status: "Active",
    verificationStatus: "Human Verified",
    verifiedAt: "2026-09-13T19:01:00.000Z",
    verifiedBy: "Test Operator",
    dataSource: "AIRTABLE",
    airtableStatus: "saved",
    ...overrides,
  };
}

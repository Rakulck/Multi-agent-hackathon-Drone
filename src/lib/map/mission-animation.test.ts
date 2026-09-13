import { describe, expect, it } from "vitest";
import {
  buildReroutePath,
  deriveMissionVisualState,
  interpolateAltitude,
  interpolateBearing,
  mayShowApprovedReroute,
  prefersReducedMotion,
  routeBearing,
  sampleRouteByDistance,
  withVerticalFlightEndpoints,
} from "@/lib/map/mission-animation";
import type { GeoPoint3D, OperationalMemory } from "@/types/domain";

const route: GeoPoint3D[] = [
  { lat: 37, lng: -122, altitude: 20 },
  { lat: 37.001, lng: -122, altitude: 100 },
  { lat: 37.001, lng: -121.998, altitude: 60 },
];

const verifiedMemory: OperationalMemory = {
  id: "MEM-CRANE-TEST",
  learnedBy: "Atlas HeavyLift",
  routeId: "A",
  hazardType: "temporary crane",
  latitude: 37.001,
  longitude: -122,
  severity: "High",
  confidence: 0.94,
  createdAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-14T00:00:00.000Z",
  summary: "Route A blocked.",
  altitudeBandM: [90, 148],
  avoidanceRadiusM: 120,
  sourceVendor: "Atlas",
  sourceMission: "mission-1",
  status: "Active",
  verificationStatus: "Human Verified",
  verifiedAt: "2026-09-13T00:01:00.000Z",
  verifiedBy: "Operator",
  dataSource: "AIRTABLE",
  airtableStatus: "saved",
};

describe("mission animation geometry", () => {
  it("interpolates waypoints by segment distance", () => {
    const start = sampleRouteByDistance(route, 0);
    const middle = sampleRouteByDistance(route, 0.5);
    const end = sampleRouteByDistance(route, 1);

    expect(start.position).toEqual(route[0]);
    expect(middle.distanceM).toBeCloseTo(middle.totalDistanceM / 2, 5);
    expect(middle.position.lat).toBeGreaterThanOrEqual(route[0].lat);
    expect(end.position).toEqual(route.at(-1));
    expect(end.segmentProgress).toBe(1);
  });

  it("interpolates altitude continuously and clamps progress", () => {
    expect(interpolateAltitude(125, 105, 0.5)).toBe(115);
    expect(interpolateAltitude(125, 105, -1)).toBe(125);
    expect(interpolateAltitude(125, 105, 2)).toBe(105);
    expect(sampleRouteByDistance(route, 0.25).position.altitude).toBeGreaterThan(20);
  });

  it("calculates cardinal bearings and crosses north smoothly", () => {
    expect(routeBearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0);
    expect(routeBearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90);
    expect(interpolateBearing(359, 1, 0.5)).toBeCloseTo(0);
  });

  it("builds a reroute from the current hold point without a jump", () => {
    const current = { lat: 37.0008, lng: -121.9999, altitude: 105 };
    const reroute = buildReroutePath(current, route);

    expect(reroute[0]).toBe(current);
    expect(reroute.length).toBeGreaterThanOrEqual(2);
    expect(reroute[1]).not.toEqual(route[0]);
  });

  it("creates vertical takeoff and landing endpoints without moving coordinates", () => {
    const profiled = withVerticalFlightEndpoints(route, 115, 20);
    expect(profiled[0]).toEqual({ ...route[0], altitude: 115 });
    expect(profiled.at(-1)).toEqual({ ...route.at(-1)!, altitude: 80 });
    expect(profiled[1]).toEqual(route[1]);
  });
});

describe("mission route safety presentation", () => {
  it("does not visually reroute Mission 1 before Slack approval", () => {
    expect(
      mayShowApprovedReroute({
        approvalStatus: "PENDING",
        missionRun: "MISSION_1",
        memory: verifiedMemory,
      }),
    ).toBe(false);

    const state = deriveMissionVisualState({
      approvalStatus: "PENDING",
      hazardVisible: true,
      memory: verifiedMemory,
      missionRun: "MISSION_1",
      missionStatus: "OBSTACLE DETECTED",
      routeStatuses: { A: "blocked", B: "warning", C: "selected" },
      selectedRoute: "C",
    });

    expect(state.currentRoute).toBe("A");
    expect(state.routeCRecommended).toBe(true);
  });

  it("marks Route A blocked after crane detection", () => {
    const state = deriveMissionVisualState({
      hazardVisible: true,
      missionRun: "MISSION_1",
      missionStatus: "OBSTACLE DETECTED",
      routeStatuses: { A: "candidate", B: "candidate", C: "candidate" },
      selectedRoute: "A",
    });

    expect(state.displayStatuses).toEqual({ A: "blocked", B: "warning", C: "selected" });
    expect(state.eventLabel).toBe("Camera event detected");
  });

  it("selects Route B for Mission 2 before movement when memory is verified", () => {
    const state = deriveMissionVisualState({
      hazardVisible: true,
      memory: verifiedMemory,
      missionRun: "MISSION_2",
      missionStatus: "IN FLIGHT",
      routeStatuses: { A: "candidate", B: "candidate", C: "candidate" },
      selectedRoute: "A",
    });

    expect(state.currentRoute).toBe("B");
    expect(state.displayStatuses.A).toBe("blocked");
    expect(state.displayStatuses.B).toBe("selected");
    expect(state.displayStatuses.C).toBe("blocked");
    expect(state.eventLabel).toBe("Verified memory loaded before takeoff.");
  });

  it("respects reduced-motion preferences", () => {
    expect(prefersReducedMotion(() => ({ matches: true }) as MediaQueryList)).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }) as MediaQueryList)).toBe(false);
  });
});

/**
 * Typed configuration for the reusable 3D demo environment.
 *
 * All coordinates are preserved from the existing `demo-routes.ts` file
 * (already tuned to a compact, visually connected urban area) and re-exposed
 * here in the map engine's typed shape. This is a "Simulated aerial mission
 * environment" — not a certified drone corridor or a real residential address.
 */
import {
  alternateDropOffZone,
  apartmentDestination,
  craneHazard,
  demoRoutes,
  dispatchOrigin,
} from "@/data/demo-routes";
import type { RouteId } from "@/types/domain";
import type {
  CameraPresetDefinition,
  DemoRouteDefinition,
  DropOffZoneDefinition,
  ObstacleZoneDefinition,
  Waypoint3D,
} from "@/types/map";

export const SCENE_LABEL = "Simulated aerial mission environment";

function toWaypoint(point: { lat: number; lng: number; altitude: number }): Waypoint3D {
  return { lat: point.lat, lng: point.lng, altitudeM: point.altitude };
}

export const sceneCenter: Waypoint3D = { ...toWaypoint(dispatchOrigin), altitudeM: 40 };

export const sceneOrigin: DropOffZoneDefinition = {
  id: "origin",
  label: "Grocery Hub",
  position: toWaypoint(dispatchOrigin),
  role: "primary",
};

export const scenePrimaryDestination: DropOffZoneDefinition = {
  id: "destination",
  label: "Riverside Apartments",
  position: toWaypoint(apartmentDestination),
  role: "primary",
};

export const alternateDropOffA: DropOffZoneDefinition = {
  id: "DZ-ALT-A",
  label: "Terrace",
  position: toWaypoint(alternateDropOffZone.point),
  role: "alternate",
};

export const alternateDropOffB: DropOffZoneDefinition = {
  id: "DZ-ALT-B",
  label: "Front Entrance",
  position: {
    lat: alternateDropOffZone.point.lat + 0.00085,
    lng: alternateDropOffZone.point.lng - 0.00065,
    altitudeM: alternateDropOffZone.point.altitude,
  },
  role: "alternate",
};

/** Second, temporary altitude-only obstruction used later on Route C. */
export const secondObstaclePoint: Waypoint3D = {
  lat: 37.79185,
  lng: -122.39548,
  altitudeM: 140,
};

export const craneObstacle: ObstacleZoneDefinition = {
  id: "OBS-CRANE",
  type: "Construction Crane",
  position: toWaypoint(craneHazard.center),
  minAltitudeM: 90,
  maxAltitudeM: 148,
  radiusM: 120,
  severity: "blocked",
  confidence: 0.94,
  active: false,
  sourceDrone: "Atlas HeavyLift",
  memoryId: "MEM-CRANE-001",
  geofence: craneHazard.polygon.map(toWaypoint),
};

export const altitudeObstacle: ObstacleZoneDefinition = {
  id: "OBS-ALTITUDE",
  type: "Temporary Altitude Obstruction",
  position: secondObstaclePoint,
  minAltitudeM: 118,
  maxAltitudeM: 132,
  radiusM: 70,
  severity: "warning",
  confidence: 0.81,
  active: false,
};

export const obstacleDefinitions: Record<string, ObstacleZoneDefinition> = {
  [craneObstacle.id]: craneObstacle,
  [altitudeObstacle.id]: altitudeObstacle,
};

export const cameraPresets: Record<CameraPresetDefinition["id"], CameraPresetDefinition> = {
  OVERVIEW: { id: "OVERVIEW", center: sceneCenter, heading: 42, tilt: 64, range: 1650 },
  FOLLOW_DRONE: { id: "FOLLOW_DRONE", center: sceneCenter, heading: 42, tilt: 60, range: 420 },
  OBSTACLE: { id: "OBSTACLE", center: toWaypoint(craneHazard.center), heading: 20, tilt: 68, range: 380 },
  DESTINATION: { id: "DESTINATION", center: toWaypoint(apartmentDestination), heading: 30, tilt: 62, range: 460 },
};

export const animationDurations = {
  takeoffMs: 1400,
  speedTransitionMs: 800,
  altitudeTransitionMs: 1600,
  routeTransitionMs: 1800,
  cameraFollowIntervalMs: 450,
};

export const demoRouteWaypoints: Record<RouteId, Waypoint3D[]> = {
  A: demoRoutes.find((route) => route.id === "A")!.waypoints.map(toWaypoint),
  B: demoRoutes.find((route) => route.id === "B")!.waypoints.map(toWaypoint),
  C: demoRoutes.find((route) => route.id === "C")!.waypoints.map(toWaypoint),
};

export const demoRouteDefinitions: Record<RouteId, DemoRouteDefinition> = {
  A: { id: "A", name: "Route A", color: "#171717", waypoints: demoRouteWaypoints.A, distanceKm: 2.6, estimatedMinutes: 7 },
  B: { id: "B", name: "Route B", color: "#171717", waypoints: demoRouteWaypoints.B, distanceKm: 3.4, estimatedMinutes: 9 },
  C: { id: "C", name: "Route C", color: "#171717", waypoints: demoRouteWaypoints.C, distanceKm: 3.1, estimatedMinutes: 8 },
};

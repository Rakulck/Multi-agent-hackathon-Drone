/**
 * Warps the hand-tuned demo route geometry (routes A/B/C, the crane hazard,
 * the secondary altitude obstacle, and the drop-off zones) onto a new
 * origin/destination pair.
 *
 * When a mission provides real geocoded pickup/drop addresses, this lets the
 * 3D map show those *real* coordinates while preserving the exact shape of
 * the simulated obstacle-avoidance story (Route A still runs closest to the
 * hazard, Route C is still the safe alternate, etc.) — just relocated.
 *
 * The technique: every reference point is expressed once as a fraction along
 * the original origin→destination path (`t`) plus a perpendicular offset as
 * a fraction of that same path length (`perpFrac`). Reconstructing a point
 * for a *new* origin/destination pair only requires the new path's bearing
 * and length, so the whole geometry scales and rotates together no matter
 * how far apart (or in what direction) the real addresses are.
 */
import {
  altitudeCeilingAnchor,
  airspaceSnapshotMeta,
  permittedOperatingCorridor,
  restrictedAirspacePolygons,
} from "@/data/demo-airspace";
import { alternateDropOffA, alternateDropOffB, altitudeObstacle, secondObstaclePoint } from "@/data/demo-scene";
import { alternateDropOffZone, apartmentDestination, craneHazard, demoRoutes, dispatchOrigin } from "@/data/demo-routes";
import type { AirspaceMapOverlay, DemoRoute, DropOffZone, GeoPoint3D, HazardZone, MissionMapScene } from "@/types/domain";
import type { CameraPresetDefinition, CameraPresetId, Waypoint3D } from "@/types/map";

const EARTH_RADIUS_KM = 6371;

interface LocalOffset {
  t: number;
  perpFrac: number;
  altitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(origin: { lat: number; lng: number }, bearing: number, distanceKm: number): { lat: number; lng: number } {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearingRad = toRadians(bearing);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDegrees(lat2), lng: ((toDegrees(lng2) + 540) % 360) - 180 };
}

function toLocalOffset(origin: GeoPoint3D, destination: GeoPoint3D, point: GeoPoint3D): LocalOffset {
  const pathBearing = bearingDeg(origin, destination);
  const pathDist = haversineKm(origin, destination);
  const pointDist = haversineKm(origin, point);
  const relBearingRad = toRadians(bearingDeg(origin, point) - pathBearing);
  const along = pointDist * Math.cos(relBearingRad);
  const perp = pointDist * Math.sin(relBearingRad);

  return {
    t: pathDist === 0 ? 0 : along / pathDist,
    perpFrac: pathDist === 0 ? 0 : perp / pathDist,
    altitude: point.altitude,
  };
}

function fromLocalOffset(origin: GeoPoint3D, destination: GeoPoint3D, offset: LocalOffset): GeoPoint3D {
  const pathBearing = bearingDeg(origin, destination);
  const pathDist = haversineKm(origin, destination);
  const along = offset.t * pathDist;
  const perp = offset.perpFrac * pathDist;
  const dist = Math.sqrt(along * along + perp * perp);
  const angleOffsetDeg = dist === 0 ? 0 : toDegrees(Math.atan2(perp, along));
  const point = destinationPoint(origin, pathBearing + angleOffsetDeg, dist);

  return { lat: point.lat, lng: point.lng, altitude: offset.altitude };
}

function toWaypoint(point: GeoPoint3D): Waypoint3D {
  return { lat: point.lat, lng: point.lng, altitudeM: point.altitude };
}

/* -------------------------------------------------------------------------- */
/* Reference geometry — computed once against the original demo scene.       */
/* -------------------------------------------------------------------------- */

const referenceRoutes = demoRoutes.map((route) => ({
  id: route.id,
  name: route.name,
  label: route.label,
  offsets: route.waypoints.map((waypoint) => toLocalOffset(dispatchOrigin, apartmentDestination, waypoint)),
}));

const referenceHazardCenterOffset = toLocalOffset(dispatchOrigin, apartmentDestination, craneHazard.center);
const referenceHazardPolygonOffsets = craneHazard.polygon.map((point) => toLocalOffset(dispatchOrigin, apartmentDestination, point));

const referenceSecondObstacleOffset = toLocalOffset(dispatchOrigin, apartmentDestination, {
  lat: secondObstaclePoint.lat,
  lng: secondObstaclePoint.lng,
  altitude: secondObstaclePoint.altitudeM,
});

const referenceDropOffOffset = toLocalOffset(dispatchOrigin, apartmentDestination, alternateDropOffZone.point);

const referenceAltDropOffAOffset = toLocalOffset(dispatchOrigin, apartmentDestination, {
  lat: alternateDropOffA.position.lat,
  lng: alternateDropOffA.position.lng,
  altitude: alternateDropOffA.position.altitudeM,
});

const referenceAltDropOffBOffset = toLocalOffset(dispatchOrigin, apartmentDestination, {
  lat: alternateDropOffB.position.lat,
  lng: alternateDropOffB.position.lng,
  altitude: alternateDropOffB.position.altitudeM,
});

const referenceRestrictedPolygonOffsets = restrictedAirspacePolygons.map((polygon) =>
  polygon.map((point) => toLocalOffset(dispatchOrigin, apartmentDestination, point)),
);
const referencePermittedCorridorOffsets = permittedOperatingCorridor.map((point) =>
  toLocalOffset(dispatchOrigin, apartmentDestination, point),
);
const referenceAltitudeCeilingOffset = toLocalOffset(dispatchOrigin, apartmentDestination, altitudeCeilingAnchor);

export const secondObstacleAltitudeRangeM: [number, number] = [altitudeObstacle.minAltitudeM, altitudeObstacle.maxAltitudeM];

function buildAirspaceOverlay(origin: GeoPoint3D, destination: GeoPoint3D): AirspaceMapOverlay {
  return {
    restrictedPolygons: referenceRestrictedPolygonOffsets.map((offsets) =>
      offsets.map((offset) => fromLocalOffset(origin, destination, offset)),
    ),
    permittedCorridor: referencePermittedCorridorOffsets.map((offset) => fromLocalOffset(origin, destination, offset)),
    altitudeCeilingAnchor: fromLocalOffset(origin, destination, referenceAltitudeCeilingOffset),
    maxAltitudeAglFt: airspaceSnapshotMeta.maxAltitudeAglFt,
    authorizationRequired: airspaceSnapshotMeta.authorizationRequired,
    corridorLabel: "FAA-constrained candidate corridor",
  };
}

/**
 * Builds a full map scene (routes, hazard, obstacles, drop-off zones) for a
 * given origin/destination pair by warping the tuned reference geometry.
 */
export function buildMissionMapScene(params: {
  origin: GeoPoint3D;
  destination: GeoPoint3D;
  originLabel: string;
  destinationLabel: string;
  isCustomAddress: boolean;
}): MissionMapScene {
  const { origin, destination, originLabel, destinationLabel, isCustomAddress } = params;

  const routes: DemoRoute[] = referenceRoutes.map((route) => ({
    id: route.id,
    name: route.name,
    label: route.label,
    waypoints: route.offsets.map((offset, index) => {
      if (index === 0) return origin;
      if (index === route.offsets.length - 1) return destination;
      return fromLocalOffset(origin, destination, offset);
    }),
  }));

  const hazard: HazardZone = {
    id: craneHazard.id,
    label: craneHazard.label,
    center: fromLocalOffset(origin, destination, referenceHazardCenterOffset),
    polygon: referenceHazardPolygonOffsets.map((offset) => fromLocalOffset(origin, destination, offset)),
  };

  const dropOffZone: DropOffZone = {
    id: alternateDropOffZone.id,
    label: alternateDropOffZone.label,
    point: fromLocalOffset(origin, destination, referenceDropOffOffset),
  };

  return {
    origin,
    destination,
    originLabel,
    destinationLabel,
    routes,
    hazard,
    secondObstacle: fromLocalOffset(origin, destination, referenceSecondObstacleOffset),
    dropOffZone,
    alternateDropOffA: fromLocalOffset(origin, destination, referenceAltDropOffAOffset),
    alternateDropOffB: fromLocalOffset(origin, destination, referenceAltDropOffBOffset),
    isCustomAddress,
    airspace: buildAirspaceOverlay(origin, destination),
  };
}

/** The original fixed demo scene — used whenever a mission has no geocoded addresses. */
export const defaultMapScene: MissionMapScene = buildMissionMapScene({
  origin: dispatchOrigin,
  destination: apartmentDestination,
  originLabel: "Grocery Hub",
  destinationLabel: "Riverside Apartments",
  isCustomAddress: false,
});

/**
 * Fixed demo geometry for two unrelated trips that converge on the same
 * northbound Financial District/Embarcadero corridor.
 */
export const sharedDemoCorridor = {
  id: "SF-FIDI-EMBARCADERO-NORTHBOUND",
  waypoints: [
    { lat: 37.79635, lng: -122.39642, altitude: 136 },
    { lat: 37.7982, lng: -122.39735, altitude: 138 },
    { lat: 37.80005, lng: -122.39852, altitude: 136 },
  ] satisfies GeoPoint3D[],
};

export function buildSharedCorridorDemoScene(
  pattern: "MISSION_1" | "MISSION_2",
  input: { pickupPlace: { label: string; lat: number; lng: number }; dropPlace: { label: string; lat: number; lng: number } },
): MissionMapScene {
  const origin = {
    lat: input.pickupPlace.lat,
    lng: input.pickupPlace.lng,
    altitude: dispatchOrigin.altitude,
  };
  const destination = {
    lat: input.dropPlace.lat,
    lng: input.dropPlace.lng,
    altitude: apartmentDestination.altitude,
  };
  const scene = buildMissionMapScene({
    origin,
    destination,
    originLabel: input.pickupPlace.label,
    destinationLabel: input.dropPlace.label,
    isCustomAddress: true,
  });
  const routeA = scene.routes.find((route) => route.id === "A")!;
  const approach =
    pattern === "MISSION_1"
      ? { lat: 37.7947, lng: -122.39552, altitude: 128 }
      : { lat: 37.79272, lng: -122.39562, altitude: 128 };
  const exit =
    pattern === "MISSION_1"
      ? { lat: 37.79875, lng: -122.39812, altitude: 126 }
      : { lat: 37.8044, lng: -122.4029, altitude: 126 };
  const hazardCenter = sharedDemoCorridor.waypoints[1];

  return {
    ...scene,
    routes: scene.routes.map((route) => {
      if (route.id === "A") {
        return {
            ...routeA,
            label: sharedDemoCorridor.id,
            waypoints: [
              origin,
              approach,
              ...sharedDemoCorridor.waypoints,
              exit,
              destination,
            ],
          };
      }
      if (pattern === "MISSION_2" && route.id === "B") {
        return {
          ...route,
          waypoints: [
            origin,
            { lat: 37.7938, lng: -122.3928, altitude: 124 },
            { lat: 37.7998, lng: -122.3921, altitude: 128 },
            { lat: 37.8048, lng: -122.4018, altitude: 122 },
            destination,
          ],
        };
      }
      if (pattern === "MISSION_2" && route.id === "C") {
        return {
          ...route,
          waypoints: [
            origin,
            { lat: 37.7942, lng: -122.4028, altitude: 134 },
            { lat: 37.7992, lng: -122.4058, altitude: 142 },
            { lat: 37.8051, lng: -122.4091, altitude: 134 },
            destination,
          ],
        };
      }
      return route;
    }),
    hazard: {
      ...scene.hazard,
      center: hazardCenter,
      polygon: [
        { lat: hazardCenter.lat - 0.00035, lng: hazardCenter.lng - 0.0004, altitude: 90 },
        { lat: hazardCenter.lat + 0.00035, lng: hazardCenter.lng - 0.0004, altitude: 90 },
        { lat: hazardCenter.lat + 0.00035, lng: hazardCenter.lng + 0.0004, altitude: 90 },
        { lat: hazardCenter.lat - 0.00035, lng: hazardCenter.lng + 0.0004, altitude: 90 },
      ],
    },
  };
}

/** Derives camera fly-to presets for a scene, scaling the overview range to fit the real distance. */
export function buildCameraPresetsForScene(scene: MissionMapScene): Record<CameraPresetId, CameraPresetDefinition> {
  const pathDistanceM = haversineKm(scene.origin, scene.destination) * 1000;
  const overviewRange = Math.max(1650, pathDistanceM * 1.6);
  const midpoint = fromLocalOffset(scene.origin, scene.destination, { t: 0.5, perpFrac: 0, altitude: 40 });

  return {
    OVERVIEW: { id: "OVERVIEW", center: toWaypoint(midpoint), heading: 42, tilt: 64, range: overviewRange },
    FOLLOW_DRONE: { id: "FOLLOW_DRONE", center: toWaypoint(midpoint), heading: 42, tilt: 60, range: 420 },
    OBSTACLE: { id: "OBSTACLE", center: toWaypoint(scene.hazard.center), heading: 20, tilt: 68, range: 380 },
    DESTINATION: { id: "DESTINATION", center: toWaypoint(scene.destination), heading: 30, tilt: 62, range: 460 },
  };
}

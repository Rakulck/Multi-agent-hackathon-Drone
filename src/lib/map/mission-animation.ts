import type {
  GeoPoint3D,
  MissionRun,
  MissionState,
  OperationalMemory,
  RouteId,
  RouteStatus,
  SlackApprovalStatus,
} from "@/types/domain";

const EARTH_RADIUS_M = 6_371_000;

export interface RouteSample {
  position: GeoPoint3D;
  headingDeg: number;
  segmentIndex: number;
  segmentProgress: number;
  distanceM: number;
  totalDistanceM: number;
}

export interface MissionVisualState {
  currentRoute: RouteId | null;
  displayStatuses: Record<RouteId, RouteStatus>;
  eventLabel: string | null;
  hazardVerified: boolean;
  memoryLabel: string;
  routeCRecommended: boolean;
  sourceLabel: string | null;
}

export interface MissionVisualStateInput {
  approvalStatus?: SlackApprovalStatus | null;
  hazardVisible: boolean;
  memory?: OperationalMemory | null;
  missionRun?: MissionRun | null;
  missionStatus?: MissionState;
  routeStatuses: Record<RouteId, RouteStatus>;
  selectedRoute: RouteId | null;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function interpolateAltitude(startM: number, endM: number, progress: number): number {
  return startM + (endM - startM) * clamp01(progress);
}

export function distanceMeters(a: Pick<GeoPoint3D, "lat" | "lng">, b: Pick<GeoPoint3D, "lat" | "lng">): number {
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing in degrees, where north is 0. */
export function routeBearing(
  a: Pick<GeoPoint3D, "lat" | "lng">,
  b: Pick<GeoPoint3D, "lat" | "lng">,
): number {
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLng = radians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Follows the shortest angular path so 359° → 1° does not spin backwards. */
export function interpolateBearing(startDeg: number, endDeg: number, progress: number): number {
  const delta = ((endDeg - startDeg + 540) % 360) - 180;
  return (startDeg + delta * clamp01(progress) + 360) % 360;
}

/**
 * Samples a route by physical segment length. This avoids short segments
 * taking the same time as long segments and keeps map/telemetry progress
 * tied to one normalized value.
 */
export function sampleRouteByDistance(waypoints: GeoPoint3D[], progress: number): RouteSample {
  if (waypoints.length === 0) {
    throw new Error("A route requires at least one waypoint.");
  }
  if (waypoints.length === 1) {
    return {
      position: waypoints[0],
      headingDeg: 0,
      segmentIndex: 0,
      segmentProgress: 1,
      distanceM: 0,
      totalDistanceM: 0,
    };
  }

  const lengths = waypoints.slice(0, -1).map((point, index) => distanceMeters(point, waypoints[index + 1]));
  const totalDistanceM = lengths.reduce((sum, length) => sum + length, 0);
  const distanceM = totalDistanceM * clamp01(progress);
  let traversed = 0;

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    const isLast = index === lengths.length - 1;
    if (distanceM <= traversed + segmentLength || isLast) {
      const localProgress = segmentLength === 0 ? 1 : clamp01((distanceM - traversed) / segmentLength);
      const start = waypoints[index];
      const end = waypoints[index + 1];
      return {
        position: {
          lat: start.lat + (end.lat - start.lat) * localProgress,
          lng: start.lng + (end.lng - start.lng) * localProgress,
          altitude: interpolateAltitude(start.altitude, end.altitude, localProgress),
        },
        headingDeg: routeBearing(start, end),
        segmentIndex: index,
        segmentProgress: localProgress,
        distanceM,
        totalDistanceM,
      };
    }
    traversed += segmentLength;
  }

  const lastIndex = waypoints.length - 1;
  return {
    position: waypoints[lastIndex],
    headingDeg: routeBearing(waypoints[lastIndex - 1], waypoints[lastIndex]),
    segmentIndex: lastIndex - 1,
    segmentProgress: 1,
    distanceM: totalDistanceM,
    totalDistanceM,
  };
}

export function splitRouteAtProgress(
  waypoints: GeoPoint3D[],
  progress: number,
): { completed: GeoPoint3D[]; remaining: GeoPoint3D[]; sample: RouteSample } {
  const sample = sampleRouteByDistance(waypoints, progress);
  const completed = [...waypoints.slice(0, sample.segmentIndex + 1), sample.position];
  const remaining = [sample.position, ...waypoints.slice(sample.segmentIndex + 1)];
  return { completed, remaining, sample };
}

/**
 * Builds a connector from the exact hold point to the first sensible forward
 * waypoint on a replacement route. The first point is always unchanged.
 */
export function buildReroutePath(current: GeoPoint3D, targetRoute: GeoPoint3D[]): GeoPoint3D[] {
  if (targetRoute.length < 2) {
    throw new Error("A reroute requires at least two waypoints.");
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  targetRoute.forEach((point, index) => {
    const candidate = distanceMeters(current, point);
    if (candidate < nearestDistance) {
      nearestDistance = candidate;
      nearestIndex = index;
    }
  });

  const forwardIndex = Math.min(
    nearestIndex === targetRoute.length - 1 ? nearestIndex : nearestIndex + 1,
    targetRoute.length - 1,
  );
  return [current, ...targetRoute.slice(forwardIndex)];
}

/** Raises route endpoints so takeoff and landing can be animated vertically at fixed coordinates. */
export function withVerticalFlightEndpoints(
  waypoints: GeoPoint3D[],
  launchAltitudeM: number,
  landingOffsetM = 24,
): GeoPoint3D[] {
  if (waypoints.length < 2) {
    throw new Error("A flight profile requires at least two waypoints.");
  }
  return waypoints.map((point, index) => {
    if (index === 0) return { ...point, altitude: launchAltitudeM };
    if (index === waypoints.length - 1) return { ...point, altitude: point.altitude + landingOffsetM };
    return point;
  });
}

export function circleAroundPoint(
  center: Pick<GeoPoint3D, "lat" | "lng">,
  radiusM: number,
  altitude: number,
  steps = 32,
): GeoPoint3D[] {
  const points: GeoPoint3D[] = [];
  const latRadians = radians(center.lat);
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const northM = Math.cos(angle) * radiusM;
    const eastM = Math.sin(angle) * radiusM;
    points.push({
      lat: center.lat + (northM / EARTH_RADIUS_M) * (180 / Math.PI),
      lng: center.lng + (eastM / (EARTH_RADIUS_M * Math.cos(latRadians))) * (180 / Math.PI),
      altitude,
    });
  }
  return points;
}

export function isVerifiedMemory(memory?: OperationalMemory | null): boolean {
  const verificationStatus = (
    memory as (OperationalMemory & { verificationStatus?: string }) | null | undefined
  )?.verificationStatus;
  return Boolean(
    memory &&
      memory.status === "Active" &&
      memory.airtableStatus === "saved" &&
      (verificationStatus === undefined || verificationStatus === "Human Verified"),
  );
}

export function mayShowApprovedReroute(input: {
  approvalStatus?: SlackApprovalStatus | null;
  memory?: OperationalMemory | null;
  missionRun?: MissionRun | null;
  missionStatus?: MissionState;
}): boolean {
  if (input.missionRun === "MISSION_2") {
    return isVerifiedMemory(input.memory);
  }
  return (
    input.approvalStatus === "APPROVED" ||
    (isVerifiedMemory(input.memory) &&
      (input.missionStatus === "MEMORY SAVED" ||
        input.missionStatus === "REROUTING" ||
        input.missionStatus === "IN FLIGHT"))
  );
}

export function deriveMissionVisualState(input: MissionVisualStateInput): MissionVisualState {
  const hazardVerified = isVerifiedMemory(input.memory);
  const missionTwoMemory = input.missionRun === "MISSION_2" && hazardVerified;
  const craneDetected =
    input.missionRun === "MISSION_1" &&
    input.hazardVisible &&
    input.missionStatus !== "DELIVERED";
  const approvedReroute = mayShowApprovedReroute(input);
  const displayStatuses = { ...input.routeStatuses };

  if (missionTwoMemory) {
    displayStatuses.A = "blocked";
    displayStatuses.B = "selected";
    displayStatuses.C = "blocked";
  } else if (craneDetected) {
    displayStatuses.A = "blocked";
    displayStatuses.B = "warning";
    displayStatuses.C = "selected";
  }

  const currentRoute =
    input.missionRun === "MISSION_2" && missionTwoMemory
      ? "B"
      : input.missionRun === "MISSION_1" &&
          input.selectedRoute === "C" &&
          !approvedReroute
        ? "A"
        : input.selectedRoute;

  if (missionTwoMemory) {
    return {
      currentRoute,
      displayStatuses,
      eventLabel: "Verified memory loaded before takeoff.",
      hazardVerified,
      memoryLabel: "VERIFIED · ACTIVE",
      routeCRecommended: false,
      sourceLabel: "Airtable Memory → Deterministic Route Rejection → Autonomous Route B",
    };
  }

  if (
    input.missionRun === "MISSION_1" &&
    (input.approvalStatus === "APPROVED" ||
      (approvedReroute &&
        (input.missionStatus === "REROUTING" || input.selectedRoute === "C")))
  ) {
    return {
      currentRoute,
      displayStatuses,
      eventLabel: "Operator approved Route C",
      hazardVerified,
      memoryLabel: hazardVerified ? "VERIFIED · ACTIVE" : "DETECTED",
      routeCRecommended: false,
      sourceLabel: "Mission Agent Recommendation → Slack Operator Approval",
    };
  }

  if (input.approvalStatus && input.missionRun === "MISSION_1") {
    return {
      currentRoute,
      displayStatuses,
      eventLabel: "Route C recommended · awaiting operator",
      hazardVerified,
      memoryLabel: hazardVerified ? "VERIFIED · ACTIVE" : "AWAITING VERIFICATION",
      routeCRecommended: true,
      sourceLabel: "Mission Agent Recommendation → Slack Operator Approval",
    };
  }

  if (input.missionStatus === "MEMORY SAVED") {
    return {
      currentRoute,
      displayStatuses,
      eventLabel: "Verified hazard saved to shared memory",
      hazardVerified,
      memoryLabel: hazardVerified ? "VERIFIED · ACTIVE" : "SAVING",
      routeCRecommended: true,
      sourceLabel: "Verified Hazard → Airtable Shared Memory",
    };
  }

  if (craneDetected) {
    return {
      currentRoute,
      displayStatuses,
      eventLabel: "Camera event detected",
      hazardVerified,
      memoryLabel: hazardVerified ? "VERIFIED · ACTIVE" : "DETECTED",
      routeCRecommended: true,
      sourceLabel: "Drone Sensor → Gemini 2.5 Flash → Deterministic Safety Engine",
    };
  }

  return {
    currentRoute,
    displayStatuses,
    eventLabel: null,
    hazardVerified,
    memoryLabel: hazardVerified ? "VERIFIED · ACTIVE" : "NONE",
    routeCRecommended: false,
    sourceLabel: null,
  };
}

export function prefersReducedMotion(
  matchMedia: ((query: string) => Pick<MediaQueryList, "matches">) | undefined =
    typeof window === "undefined" ? undefined : window.matchMedia.bind(window),
): boolean {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

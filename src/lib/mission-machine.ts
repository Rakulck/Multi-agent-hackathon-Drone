import {
  activeAirspaceRestrictions,
  airspacePreferredRoute,
  airspaceRouteCompliance,
  airspaceSnapshotMeta,
} from "@/data/demo-airspace";
import { apartmentDestination, craneHazard, dispatchOrigin, initialRouteStatuses } from "@/data/demo-routes";
import { fleetDrones } from "@/data/demo-dashboard";
import {
  buildMissionMapScene,
  buildSharedCorridorDemoScene,
  defaultMapScene,
} from "@/lib/map/route-warp";
import { sampleRouteByDistance } from "@/lib/map/mission-animation";
import type {
  AirspaceEval,
  AirspaceRouteResult,
  ApprovedPlan,
  ConnectionHealth,
  DeliveryType,
  DemoRoute,
  FleetDrone,
  FleetEvalRow,
  FlightMode,
  GeoPoint3D,
  IntegrationApp,
  IntegrationEvent,
  IntegrationStatus,
  Mission,
  MissionRiskCondition,
  MissionRiskReview,
  MissionMapScene,
  MemoryApiResponse,
  MemoryRouteMatch,
  MissionRun,
  MissionState,
  NewMissionInput,
  OperationalMemory,
  PreflightStepId,
  RouteEvalRow,
  RouteId,
  RouteStatus,
  StepEvidence,
  WeatherEvaluation,
  WeatherSnapshotData,
} from "@/types/domain";
import { preflightStepOrder } from "@/types/domain";

export const groceryOrder = {
  id: "ORDER-GROCERY-045",
  payloadKg: 4.5,
  destination: "Apartment delivery zone",
};

export const demoPresetInputs: Record<"MISSION_1" | "MISSION_2", NewMissionInput> = {
  MISSION_1: {
    customerName: "Gateway Apartments Customer",
    deliveryType: "Grocery",
    weightKg: 4.5,
    pickup: "One Market Plaza, 1 Market Street, San Francisco, CA 94105",
    drop: "The Gateway Apartments, 460 Davis Court, San Francisco, CA 94111",
    priority: "Express",
    dropOffPreference: "Courtyard",
    useDemoRecipient: true,
    pickupPlace: {
      label: "One Market Plaza, 1 Market Street, San Francisco, CA 94105",
      lat: 37.79362,
      lng: -122.39486,
    },
    dropPlace: {
      label: "The Gateway Apartments, 460 Davis Court, San Francisco, CA 94111",
      lat: 37.79872,
      lng: -122.39812,
    },
  },
  MISSION_2: {
    customerName: "Pier 39 Receiving",
    deliveryType: "Small Logistics",
    weightKg: 5.5,
    pickup: "Salesforce Tower, 415 Mission Street, San Francisco, CA 94105",
    drop: "Pier 39, The Embarcadero, San Francisco, CA 94133",
    priority: "Critical",
    dropOffPreference: "Primary entrance",
    useDemoRecipient: true,
    pickupPlace: {
      label: "Salesforce Tower, 415 Mission Street, San Francisco, CA 94105",
      lat: 37.78974,
      lng: -122.3961,
    },
    dropPlace: {
      label: "Pier 39, The Embarcadero, San Francisco, CA 94133",
      lat: 37.80867,
      lng: -122.40982,
    },
  },
};

export const memoryStorageKey = "drone-fleet-intelligence.crane-memory";

export function makeInitialFleet(): FleetDrone[] {
  return fleetDrones.map((drone) => ({ ...drone }));
}

export function makeInitialRouteStatuses(): Record<RouteId, RouteStatus> {
  return { ...initialRouteStatuses };
}

export function evaluatePayloadEligibility(drones: FleetDrone[], payloadKg: number) {
  return drones.map((drone) => ({
    drone,
    eligible: drone.status === "Available" && drone.payloadKg >= payloadKg,
    reason:
      drone.payloadKg < payloadKg
        ? `${drone.model} rejected: ${payloadKg} kg exceeds ${drone.payloadKg} kg capacity.`
        : drone.status !== "Available"
          ? `${drone.model} rejected: status is ${drone.status}.`
          : `${drone.model} approved for payload, range, battery, and availability.`,
  }));
}

export function selectDrone(drones: FleetDrone[], preferredModel: string): FleetDrone {
  const eligible = evaluatePayloadEligibility(drones, groceryOrder.payloadKg).find(
    (result) => result.eligible && result.drone.model === preferredModel,
  );

  if (!eligible) {
    throw new Error(`No eligible drone found for ${preferredModel}.`);
  }

  return eligible.drone;
}

export function createCraneMemory(params: {
  sourceDrone: string;
  sourceVendor: string;
  sourceMission: string;
  location?: GeoPoint3D;
  dataSource?: OperationalMemory["dataSource"];
}): OperationalMemory {
  const detectedAt = new Date();
  const location = params.location ?? craneHazard.center;

  return {
    id: `MEM-CRANE-${Math.round(location.lat * 100_000)}-${Math.round(Math.abs(location.lng) * 100_000)}-${detectedAt.getTime()}`,
    learnedBy: params.sourceDrone,
    routeId: "A",
    hazardType: "temporary crane",
    latitude: location.lat,
    longitude: location.lng,
    severity: "High",
    confidence: 0.94,
    createdAt: detectedAt.toISOString(),
    expiresAt: new Date(detectedAt.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    summary: `Blocked aerial corridor near ${craneHazard.label}; avoid Route A before takeoff.`,
    altitudeBandM: [90, 148],
    avoidanceRadiusM: 120,
    sourceVendor: params.sourceVendor,
    sourceMission: params.sourceMission,
    status: "Inactive",
    verificationStatus: "Awaiting Verification",
    dataSource: params.dataSource ?? "AIRTABLE",
    airtableStatus: "draft",
  };
}

export function verifyOperationalMemory(
  memory: OperationalMemory,
  operatorName: string,
  verifiedAt = new Date().toISOString(),
): OperationalMemory {
  return {
    ...memory,
    status: "Active",
    verificationStatus: "Human Verified",
    verifiedAt,
    verifiedBy: operatorName,
    airtableStatus: memory.dataSource === "DEMO_FALLBACK" ? "fallback" : "saving",
  };
}

export function markMemorySaved(memory: OperationalMemory): OperationalMemory {
  return {
    ...memory,
    status: "Active",
    verificationStatus: "Human Verified",
    dataSource: "AIRTABLE",
    airtableStatus: "saved",
  };
}

export function markMemoryUsed(memory: OperationalMemory, usedBy: string): OperationalMemory {
  return {
    ...memory,
    usedBy,
  };
}

export function isMemoryActive(memory: OperationalMemory | null): memory is OperationalMemory {
  return Boolean(
    memory &&
      memory.status === "Active" &&
      memory.verificationStatus === "Human Verified" &&
      Boolean(memory.verifiedAt) &&
      new Date(memory.expiresAt).getTime() > Date.now(),
  );
}

export function isMemoryFetchSuccess(
  status: MemoryApiResponse["status"],
): status is "SUCCESS" | "SUCCESS_EMPTY" {
  return status === "SUCCESS" || status === "SUCCESS_EMPTY";
}

export function interpolateRoute(routes: DemoRoute[], routeId: RouteId, progress: number): GeoPoint3D {
  const route = routes.find((candidate) => candidate.id === routeId);

  if (!route) {
    throw new Error(`Unknown route ${routeId}.`);
  }

  return sampleRouteByDistance(route.waypoints, progress).position;
}

function minimumRouteDistanceM(latitude: number, longitude: number, waypoints: GeoPoint3D[]) {
  const latScale = 111_320;
  const lngScale = latScale * Math.cos(latitude * (Math.PI / 180));
  let minimum = Number.POSITIVE_INFINITY;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index];
    const end = waypoints[index + 1];
    const startX = (start.lng - longitude) * lngScale;
    const startY = (start.lat - latitude) * latScale;
    const endX = (end.lng - longitude) * lngScale;
    const endY = (end.lat - latitude) * latScale;
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSquared = dx * dx + dy * dy;
    const progress =
      lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(startX * dx + startY * dy) / lengthSquared));
    minimum = Math.min(minimum, Math.hypot(startX + progress * dx, startY + progress * dy));
  }

  return minimum;
}

/**
 * Derives the presentation-facing flight mode from the internal mission
 * state machine. `override` lets human-in-the-loop actions (e.g. Return
 * Home) take precedence without altering the underlying mission logic.
 */
export function deriveFlightMode(params: {
  status: MissionState;
  progress: number;
  override: FlightMode | null;
}): FlightMode {
  const { status, progress, override } = params;

  if (override) {
    return override;
  }

  if (status === "OBSTACLE DETECTED" || status === "ABORTED") {
    return "HOLD";
  }

  if (status === "REROUTING") {
    return "REROUTING";
  }

  if (status === "RETURNING_HOME") {
    return "RETURNING";
  }

  if (status === "IN FLIGHT") {
    if (progress >= 0.97) {
      return "DROP-OFF";
    }
    if (progress <= 0.12) {
      return "TAKEOFF";
    }
    if (progress >= 0.82) {
      return "APPROACH";
    }
    return "CRUISE";
  }

  if (status === "DELIVERED") {
    return "DELIVERED";
  }

  return "EVALUATING";
}

const flightModeSpeedKmh: Record<FlightMode, number> = {
  TAKEOFF: 18,
  CRUISE: 46,
  HOLD: 0,
  EVALUATING: 0,
  REROUTING: 6,
  APPROACH: 21,
  "DROP-OFF": 2,
  RETURNING: 38,
  DELIVERED: 0,
};

export function speedForFlightMode(mode: FlightMode): number {
  return flightModeSpeedKmh[mode];
}

export function connectionHealthForFlightMode(mode: FlightMode): ConnectionHealth {
  return mode === "HOLD" || mode === "REROUTING" ? "Degraded" : "Nominal";
}

export function waypointLabel(routes: DemoRoute[], routeId: RouteId | null, progress: number): string {
  if (!routeId) {
    return "Awaiting route lock";
  }

  const route = routes.find((candidate) => candidate.id === routeId);

  if (!route) {
    return "Awaiting route lock";
  }

  const segments = route.waypoints.length - 1;
  const index = Math.min(route.waypoints.length, Math.max(1, Math.round(progress * segments) + 1));
  return `WP ${index} of ${route.waypoints.length} · Route ${routeId}`;
}

const MAX_INTEGRATION_EVENTS = 8;

/**
 * Appends a sanitized integration-flow event, marking any previously
 * "Processing" step as "Completed" first. External calls remain in server
 * routes; this helper only updates presentation state.
 */
export function appendIntegrationEvent(
  events: IntegrationEvent[],
  app: IntegrationApp,
  result: string,
  status: IntegrationStatus = "Processing",
): IntegrationEvent[] {
  const settled = events.map((event, index) =>
    index === events.length - 1 && event.status === "Processing" ? { ...event, status: "Completed" as const } : event,
  );

  const next: IntegrationEvent = {
    id: `${app}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    app,
    result,
    status,
    timestamp: formatClockTime(new Date()),
  };

  return [...settled, next].slice(-MAX_INTEGRATION_EVENTS);
}

/** Marks the most recent integration event as settled without adding a new one. */
export function settleLastIntegrationEvent(
  events: IntegrationEvent[],
  status: IntegrationStatus = "Completed",
): IntegrationEvent[] {
  if (events.length === 0) {
    return events;
  }

  return events.map((event, index) => (index === events.length - 1 ? { ...event, status } : event));
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/* -------------------------------------------------------------------------- */
/* Sequential preflight: pure step evaluators                                 */
/*                                                                            */
/* Every function below is a deterministic, side-effect-free evaluator. The   */
/* dashboard shell calls these once per step, then drives the visible        */
/* Waiting -> Evaluating -> Completed/Warning/Failed transitions on a timer.  */
/* -------------------------------------------------------------------------- */

export const MISSION_RANGE_KM = 6.4;
export const BATTERY_RESERVE_PERCENT = 30;
export const ESTIMATED_MISSION_BATTERY_USE_PERCENT = 18;
export const BASE_CRUISE_SPEED_MPH = 28;

export function makeEmptyStepEvidence(): Record<PreflightStepId, StepEvidence> {
  const entries = preflightStepOrder.map((id) => [
    id,
    {
      id,
      title: stepTitles[id],
      input: [],
      evaluation: [],
      decision: "",
      source: [],
      status: "Waiting" as const,
      summary: "",
    },
  ]);
  return Object.fromEntries(entries) as Record<PreflightStepId, StepEvidence>;
}

export const stepTitles: Record<PreflightStepId, string> = {
  REQUEST: "Understand Request",
  FLEET: "Evaluate Fleet",
  WEATHER: "Evaluate Weather",
  AIRSPACE: "Airspace Compliance",
  MEMORY: "Retrieve Shared Memory",
  ROUTES: "Evaluate Routes",
  APPROVAL: "Check Human Approval",
  READY: "Build Approved Plan",
};

let missionCounter = 0;

/** Builds the mission's map scene from geocoded pickup/drop addresses, falling back to the fixed demo scene. */
export function buildMapSceneForInput(input: NewMissionInput): MissionMapScene {
  if (!input.pickupPlace || !input.dropPlace) {
    return {
      ...defaultMapScene,
      originLabel: input.pickup,
      destinationLabel: input.drop,
      dropOffZone: {
        ...defaultMapScene.dropOffZone,
        label: input.drop,
      },
    };
  }

  return buildMissionMapScene({
    origin: { lat: input.pickupPlace.lat, lng: input.pickupPlace.lng, altitude: dispatchOrigin.altitude },
    destination: { lat: input.dropPlace.lat, lng: input.dropPlace.lng, altitude: apartmentDestination.altitude },
    originLabel: input.pickupPlace.label,
    destinationLabel: input.dropPlace.label,
    isCustomAddress: true,
  });
}

export function createMission(
  input: NewMissionInput,
  pattern: MissionRun = "MISSION_1",
  options: { isDemoPreset?: boolean } = {},
): Mission {
  missionCounter += 1;
  const baseMapScene = buildMapSceneForInput(input);
  const presetMapScene =
    options.isDemoPreset && input.pickupPlace && input.dropPlace
      ? buildSharedCorridorDemoScene(pattern, {
          pickupPlace: input.pickupPlace,
          dropPlace: input.dropPlace,
        })
      : baseMapScene;
  const mapScene =
    options.isDemoPreset && pattern === "MISSION_1"
      ? {
          ...presetMapScene,
          airspace: {
            ...presetMapScene.airspace,
            authorizationRequired: false,
            corridorLabel: "Approved controlled Mission 1 demo corridor",
          },
        }
      : presetMapScene;

  return {
    id: `mission-${Date.now()}-${missionCounter}`,
    label: `Mission ${missionCounter}`,
    createdAt: formatClockTime(new Date()),
    input,
    lifecycle: "NEW",
    pattern,
    isDemoPreset: options.isDemoPreset ?? false,
    steps: makeEmptyStepEvidence(),
    activeStepId: null,
    fleetEligibility: null,
    provisionalDrone: null,
    confirmedDrone: null,
    weatherMode: options.isDemoPreset ? "SAFE" : "LIVE",
    weatherFetchState: "IDLE",
    weatherFetchMessage: null,
    weather: null,
    weatherEvaluation: null,
    weatherApprovalGranted: false,
    memoryMode: "AIRTABLE",
    memoryFetchState: "IDLE",
    memoryFetchMessage: null,
    memories: [],
    memoryMatches: [],
    cruiseSpeedMph: null,
    etaDeltaMin: 0,
    routeEval: null,
    selectedRoute: null,
    airspaceEval: null,
    riskReview: null,
    approvalRequired: false,
    plan: null,
    mapScene,
    customerCommunication: null,
  };
}

export function primaryDropOffName(input: NewMissionInput): string {
  const location = input.drop.trim();
  return location
    ? `${input.dropOffPreference} at ${location}`
    : input.dropOffPreference;
}

export function resetMissionCounter() {
  missionCounter = 0;
}

/** STEP 1 — Understand Request. */
export function buildRequestStepEvidence(input: NewMissionInput): StepEvidence {
  const cargoRequirement =
    input.weightKg > 6 ? "Heavy-lift cargo bay" : input.deliveryType === "Medical" ? "Climate-controlled bay" : "Standard cargo bay";

  const decision = `Valid ${input.priority.toLowerCase()} ${input.deliveryType.toLowerCase()} mission. ${cargoRequirement} required.`;

  return {
    id: "REQUEST",
    title: stepTitles.REQUEST,
    input: [
      ...(input.customerName ? [`Customer: ${input.customerName}`] : []),
      `${input.deliveryType} delivery`,
      `${input.weightKg} kg package`,
      `Pickup: ${input.pickup}`,
      `Drop: ${input.drop}`,
      `${input.priority} priority`,
      `${input.dropOffPreference} drop-off`,
    ],
    evaluation: [
      "Validated required fields.",
      `Normalized package weight to ${input.weightKg} kg.`,
      "Resolved pickup and destination coordinates.",
      "Identified delivery requirements from priority and type.",
      `Determined special payload capability: ${cargoRequirement}.`,
    ],
    decision,
    source: ["Mission Agent"],
    status: "Completed",
    summary: `${input.weightKg} kg ${input.priority.toLowerCase()} ${input.deliveryType.toLowerCase()} mission validated.`,
  };
}

/** STEP 2 — Evaluate Fleet. */
export function fleetSnapshotForPreflight(
  fleet: FleetDrone[],
  pattern: MissionRun,
): FleetDrone[] {
  if (pattern === "MISSION_2") {
    return fleet.map((drone) =>
      drone.model === "Atlas HeavyLift" && drone.status === "Available" ? { ...drone, status: "Charging" as const } : drone,
    );
  }

  return fleet;
}

export function evaluateFleetForMission(fleet: FleetDrone[], weightKg: number, deliveryType: DeliveryType): FleetEvalRow[] {
  return fleet.map((drone) => {
    const requiredCapability =
      weightKg > 6 ? "heavy-lift cargo bay" : deliveryType === "Medical" ? "climate-controlled bay" : "standard cargo bay";
    const hasCapability = requiredCapability === "heavy-lift cargo bay" ? drone.payloadKg >= 8 : true;

    if (drone.status !== "Available") {
      return { drone, eligible: false, reason: `${drone.model} rejected: status is ${drone.status}.` };
    }

    if (drone.payloadKg < weightKg) {
      return {
        drone,
        eligible: false,
        reason: `${drone.model} rejected: ${weightKg} kg exceeds ${drone.payloadKg} kg payload.`,
      };
    }

    if (drone.rangeKm < MISSION_RANGE_KM) {
      return {
        drone,
        eligible: false,
        reason: `${drone.model} rejected: ${MISSION_RANGE_KM} km mission exceeds ${drone.rangeKm} km range.`,
      };
    }

    const projectedReserve =
      drone.batteryPercent - ESTIMATED_MISSION_BATTERY_USE_PERCENT;
    if (projectedReserve < BATTERY_RESERVE_PERCENT) {
      return {
        drone,
        eligible: false,
        reason: `${drone.model} rejected: projected landing reserve ${projectedReserve}% is below the ${BATTERY_RESERVE_PERCENT}% minimum.`,
      };
    }

    if (!hasCapability) {
      return { drone, eligible: false, reason: `${drone.model} rejected: lacks required ${requiredCapability}.` };
    }

    return {
      drone,
      eligible: true,
      reason: `${drone.model} approved: projected landing reserve ${projectedReserve}% satisfies the ${BATTERY_RESERVE_PERCENT}% minimum; payload, range, availability and capability confirmed.`,
    };
  });
}

export function pickProvisionalDrone(rows: FleetEvalRow[]): FleetEvalRow | null {
  return rows.find((row) => row.eligible) ?? null;
}

export function buildFleetStepEvidence(rows: FleetEvalRow[], weightKg: number): StepEvidence {
  const eligibleCount = rows.filter((row) => row.eligible).length;
  const provisional = pickProvisionalDrone(rows);

  return {
    id: "FLEET",
    title: stepTitles.FLEET,
    input: [
      `Package weight: ${weightKg} kg`,
      `Mission distance: ${MISSION_RANGE_KM} km`,
      `Battery reserve requirement: ${BATTERY_RESERVE_PERCENT}%`,
      `Estimated mission battery use: ${ESTIMATED_MISSION_BATTERY_USE_PERCENT}%`,
      "Drone availability and capabilities loaded from Airtable fleet table.",
    ],
    evaluation: rows.map((row) => `${row.drone.model}: ${row.reason}`),
    decision: provisional
      ? `${rows.length - eligibleCount} of ${rows.length} drones rejected. Provisional selection: ${provisional.drone.model}.`
      : "No eligible drone found for this payload.",
    source: ["Airtable", "Deterministic Safety Engine"],
    status: provisional ? "Completed" : "Failed",
    summary: `${eligibleCount} of ${rows.length} drones eligible. ${
      provisional ? `${provisional.drone.model} provisionally selected.` : "No eligible drone."
    }`,
  };
}

/** STEP 3 — Evaluate Weather. */
export function evaluateWeatherForDrones(rows: FleetEvalRow[], weather: WeatherSnapshotData) {
  const eligible = rows.filter((row) => row.eligible);
  const peakWindMph = Math.max(weather.windMph, weather.gustMph);
  const droneEvaluations = eligible.map((row) => {
    const accepted = weather.windMph <= row.drone.windLimitMph && weather.gustMph <= row.drone.windLimitMph;
    const utilizationPercent = Math.round((peakWindMph / row.drone.windLimitMph) * 100);
    return {
      drone: row.drone,
      accepted,
      utilizationPercent,
      reason: accepted
        ? `${row.drone.model} accepted: ${weather.windMph} mph wind and ${weather.gustMph} mph gust are within its ${row.drone.windLimitMph} mph limit.`
        : `${row.drone.model} rejected: ${weather.windMph} mph wind / ${weather.gustMph} mph gust exceeds its ${row.drone.windLimitMph} mph limit.`,
    };
  });
  const accepted = droneEvaluations.filter((entry) => entry.accepted);
  const confirmedEntry =
    accepted.reduce<(typeof accepted)[number] | null>(
      (best, entry) => (!best || entry.drone.windLimitMph > best.drone.windLimitMph ? entry : best),
      null,
    );
  const utilization = confirmedEntry?.utilizationPercent ?? 100;
  const moderate = Boolean(confirmedEntry && utilization >= 60);
  const speedReductionMph = moderate ? (utilization >= 80 ? 6 : 4) : 0;
  const cruiseSpeedMph = confirmedEntry ? BASE_CRUISE_SPEED_MPH - speedReductionMph : null;
  const etaDeltaMin = moderate ? (utilization >= 80 ? 2 : 1) : 0;
  const paused = confirmedEntry === null;
  const severity: WeatherEvaluation["severity"] = paused ? "UNSAFE" : moderate ? "MODERATE" : "SAFE";

  return {
    droneEvaluations,
    confirmedDrone: confirmedEntry?.drone ?? null,
    severity,
    cruiseSpeedMph,
    speedReductionMph,
    etaDeltaMin,
    paused,
    reason: paused
      ? "Mission paused: current wind or gust exceeds every payload-eligible drone's certified limit."
      : moderate
        ? `${confirmedEntry.drone.model} has sufficient margin, but peak wind uses ${utilization}% of its limit; moderate-wind speed controls applied.`
        : `${confirmedEntry.drone.model} has sufficient wind margin; no speed adjustment required.`,
  };
}

export function buildWeatherStepEvidence(params: {
  weather: WeatherSnapshotData;
  evaluation: WeatherEvaluation;
  fetchState: Mission["weatherFetchState"];
  fetchMessage: string;
}): StepEvidence {
  const { weather, evaluation, fetchState, fetchMessage } = params;
  const adjusted = evaluation.speedReductionMph > 0;
  const liveFetchFailed = fetchState !== "SUCCESS";
  const status =
    evaluation.paused
      ? "Failed"
      : evaluation.severity === "MODERATE" || liveFetchFailed
        ? "Warning"
        : "Completed";

  return {
    id: "WEATHER",
    title: stepTitles.WEATHER,
    input: [
      `Weather received: ${fetchState} — ${fetchMessage}`,
      `Data source: ${weather.dataSource}`,
      `Pickup: ${weather.locations.pickup.windMph} mph wind, ${weather.locations.pickup.gustMph} mph gust`,
      `Drop-off: ${weather.locations.dropOff.windMph} mph wind, ${weather.locations.dropOff.gustMph} mph gust`,
      `Wind: ${weather.windMph} mph`,
      `Gust: ${weather.gustMph} mph`,
      `Direction: ${weather.windDirectionDeg}°`,
      `Visibility: ${weather.visibilityMiles} miles`,
      `Temperature: ${weather.temperatureF}°F`,
      `Condition: ${weather.condition}`,
      `Last updated: ${weather.updatedAt}`,
    ],
    evaluation: [
      ...evaluation.droneEvaluations.map(
        (entry) => `${entry.reason} Peak utilization: ${entry.utilizationPercent}%.`,
      ),
      adjusted
        ? `Moderate wind adjustment: speed ${BASE_CRUISE_SPEED_MPH} → ${evaluation.cruiseSpeedMph} mph; ETA +${evaluation.etaDeltaMin} min.`
        : evaluation.paused
          ? "Speed/ETA adjustment: none; launch is paused."
          : `Speed/ETA adjustment: none; ${BASE_CRUISE_SPEED_MPH} mph base cruise retained.`,
      "Safety decision made by deterministic thresholds; Gemini cannot override it.",
    ],
    decision: `${evaluation.severity}: ${evaluation.reason}`,
    source:
      weather.dataSource === "LIVE"
        ? ["OpenWeather LIVE", "Deterministic Safety Engine"]
        : ["DEMO_FALLBACK (not live)", "Deterministic Safety Engine"],
    status,
    summary: evaluation.paused
      ? "UNSAFE — mission paused; every eligible drone rejected."
      : `${evaluation.severity} — ${evaluation.confirmedDrone?.model ?? "No drone"} confirmed at ${evaluation.cruiseSpeedMph} mph.`,
  };
}

/** STEP 4 — Airspace Compliance. */
export function evaluateAirspaceForMission(
  selectedRoute: RouteId | null = null,
  options: {
    controlledDemoPreset?: boolean;
    routeCRequiresAuthorization?: boolean;
  } = {},
): AirspaceEval {
  const routeResults: AirspaceRouteResult[] = (["A", "B", "C"] as RouteId[]).map((id) => {
    const compliance = airspaceRouteCompliance[id];
    const requiresUnavailableAuthorization =
      id === "C" && options.routeCRequiresAuthorization;
    return {
      id,
      name: `Route ${id}`,
      eligible: compliance.eligible && !requiresUnavailableAuthorization,
      plannedAglFt: compliance.plannedAglFt,
      reason: requiresUnavailableAuthorization
        ? "Unavailable for Mission 2: the alternate corridor lacks the required FAA/LAANC authorization."
        : compliance.reason,
    };
  });

  const eligible = routeResults.filter((row) => row.eligible).map((row) => row.name);
  const preferred = selectedRoute && routeResults.some((row) => row.id === selectedRoute && row.eligible) ? selectedRoute : airspacePreferredRoute;

  const authorizationRequired =
    options.controlledDemoPreset ? false : airspaceSnapshotMeta.authorizationRequired;

  return {
    airspaceClass: airspaceSnapshotMeta.airspaceClass,
    maxAltitudeAglFt: airspaceSnapshotMeta.maxAltitudeAglFt,
    authorizationRequired,
    laancAuthorized: options.controlledDemoPreset ?? false,
    restrictions: activeAirspaceRestrictions.map((restriction) => ({ ...restriction })),
    routeResults,
    preferredRoute: preferred,
    dataSource: airspaceSnapshotMeta.dataSource,
    timestamp: airspaceSnapshotMeta.updatedAt,
    facilityMapGrid: airspaceSnapshotMeta.facilityMapGrid,
    decision: options.controlledDemoPreset
      ? `${eligible.join(", ")} pass the published ceiling and geofence rules. Route ${preferred} is eligible in the pre-authorized controlled demo corridor.`
      : `${eligible.join(", ")} pass the published ceiling and geofence rules. Route ${preferred} remains eligible in controlled airspace with mock LAANC authorization still required.`,
  };
}

export function buildAirspaceStepEvidence(evalResult: AirspaceEval): StepEvidence {
  const activeRestrictions = evalResult.restrictions.filter((restriction) => restriction.active);

  return {
    id: "AIRSPACE",
    title: stepTitles.AIRSPACE,
    input: [
      `Airspace status: ${evalResult.airspaceClass}`,
      `FAA UAS Facility Map grid: ${evalResult.facilityMapGrid}`,
      `Maximum permitted altitude: ${evalResult.maxAltitudeAglFt} ft AGL`,
      `Authorization required: ${evalResult.authorizationRequired ? "Yes" : "No"} (mock LAANC — not submitted)`,
      `Active restrictions: ${activeRestrictions.length}`,
      `Data source: ${evalResult.dataSource}`,
      `Timestamp: ${formatTimestampShort(evalResult.timestamp)}`,
    ],
    evaluation: [
      `Controlled vs uncontrolled: ${evalResult.airspaceClass} airspace.`,
      `UAS Facility Map ceiling: ${evalResult.maxAltitudeAglFt} ft AGL.`,
      ...activeRestrictions.map(
        (restriction) => `${restriction.type} ${restriction.id}: ${restriction.label} — ${restriction.detail}`,
      ),
      `LAANC authorization required: ${evalResult.authorizationRequired ? "Yes" : "No"}. Real authorization present: No.`,
      "Corridor labeled as FAA-constrained candidate corridor (not an official authorized route).",
      ...evalResult.routeResults.map(
        (row) =>
          `${row.name}: planned ${row.plannedAglFt} ft AGL — ${row.eligible ? "eligible" : "ineligible"} (${row.reason})`,
      ),
    ],
    decision: evalResult.decision,
    source: ["FAA UAS Facility Map (public)", "Mock TFR/NOTAM", "Mock LAANC status", "Deterministic Safety Engine"],
    status: evalResult.authorizationRequired ? "Warning" : "Completed",
    summary: `Max ${evalResult.maxAltitudeAglFt} ft AGL. Auth required: ${
      evalResult.authorizationRequired ? "Yes" : "No"
    }. Route ${evalResult.preferredRoute} preferred.`,
  };
}

/** STEP 5 — Retrieve Shared Memory. */
export function evaluateMemoriesAgainstRoutes(
  memories: OperationalMemory[],
  routes: DemoRoute[],
): MemoryRouteMatch[] {
  return memories.filter(isMemoryActive).flatMap((memory) =>
    routes.map((route) => {
      const distanceM = minimumRouteDistanceM(memory.latitude, memory.longitude, route.waypoints);
      const routeAltitudes = route.waypoints.map((point) => point.altitude);
      const routeMin = Math.min(...routeAltitudes);
      const routeMax = Math.max(...routeAltitudes);
      const altitudeOverlap = routeMax >= memory.altitudeBandM[0] && routeMin <= memory.altitudeBandM[1];
      const matched = distanceM <= memory.avoidanceRadiusM && altitudeOverlap;
      return {
        memoryId: memory.id,
        routeId: route.id,
        distanceM: Math.round(distanceM),
        altitudeOverlap,
        matched,
        reason: matched
          ? `Route ${route.id} enters the ${memory.avoidanceRadiusM} m avoidance radius at an overlapping altitude.`
          : `Route ${route.id}: nearest point ${Math.round(distanceM)} m; altitude overlap ${altitudeOverlap ? "yes" : "no"}.`,
      };
    }),
  );
}

export function buildMemoryStepEvidence(params: {
  response: MemoryApiResponse;
  matches: MemoryRouteMatch[];
  retrievedBy: string | null;
}): StepEvidence {
  const { response, matches, retrievedBy } = params;
  const failed = !isMemoryFetchSuccess(response.status);
  const blockingMatches = matches.filter((match) => match.matched);

  return {
    id: "MEMORY",
    title: stepTitles.MEMORY,
    input: [
      response.status === "SUCCESS_EMPTY"
        ? "Active verified memories retrieved from Airtable. No records returned."
        : `Memory load state: ${response.status} — ${response.message}`,
      `Data source: ${response.source}`,
      "Candidate route coordinates and altitude bands: A, B, C",
      `Current time: ${formatClockTime(new Date())}`,
      `Active, non-expired records received: ${response.memories.length}`,
    ],
    evaluation: failed
      ? [
          "Airtable memory could not be verified.",
          "No local or stale memory was substituted in normal mode.",
          "Route safety cannot be completed without human review.",
        ]
      : response.memories.length === 0
        ? ["No relevant shared hazards found."]
        : [
            ...response.memories.map(
              (memory) => {
                const intersects = matches.some(
                  (match) => match.memoryId === memory.id && match.matched,
                );
                if (retrievedBy && intersects) {
                  return `${memory.learnedBy} crane memory intersects Mission 2’s Route A shared corridor despite different pickup and destination addresses. Record ${memory.id}; expires ${formatTimestampShort(memory.expiresAt)}.`;
                }
                return intersects
                  ? `${memory.id}, created by ${memory.learnedBy} (${memory.sourceVendor}), intersects a candidate route in both location and altitude.`
                  : `${memory.id}, created by ${memory.learnedBy} (${memory.sourceVendor}), does not intersect a candidate route in both location and altitude; expires ${formatTimestampShort(memory.expiresAt)}.`;
              },
            ),
            ...matches.map((match) => `${match.memoryId}: ${match.reason}`),
          ],
    decision: failed
      ? "Mission paused. Human approval required because Airtable memory state is unavailable."
      : blockingMatches.length > 0
        ? "Route A rejected from shared memory. Route C rejected because FAA/LAANC authorization is unavailable. Route B selected before takeoff."
        : "No relevant shared hazards found.",
    source:
      response.presetIsolation
        ? ["Controlled Mission 1 preset", "Deterministic Safety Engine"]
        : response.source === "AIRTABLE"
        ? ["Airtable", "Spatial Safety Engine", "Mission Agent"]
        : ["localStorage DEMO_FALLBACK (not Airtable)", "Deterministic Safety Engine"],
    status: failed ? "Approval" : blockingMatches.length > 0 ? "Warning" : "Completed",
    summary: failed
      ? `${response.status} — mission paused for human approval.`
      : blockingMatches.length > 0
        ? "Different locations · shared corridor · verified memory reused."
        : "No relevant shared hazards found.",
  };
}

/** STEP 6 — Evaluate Routes. */
const routeBaseStats: Record<RouteId, { distanceKm: number; etaMin: number }> = {
  A: { distanceKm: 2.6, etaMin: 7 },
  B: { distanceKm: 3.4, etaMin: 9 },
  C: { distanceKm: 3.1, etaMin: 8 },
};

export function evaluateRoutesForMission(
  memoryBlocksRouteA: boolean,
  airspaceEval: AirspaceEval | null = null,
  blockingMemoryId: string | null = null,
): { rows: RouteEvalRow[]; selectedRoute: RouteId } {
  const airspaceBlocksA = Boolean(airspaceEval && !airspaceEval.routeResults.find((row) => row.id === "A")?.eligible);
  const airspacePreferred = airspaceEval?.preferredRoute ?? null;

  if (!memoryBlocksRouteA && !airspaceBlocksA) {
    const rows: RouteEvalRow[] = [
      {
        id: "A",
        name: "Route A",
        ...routeBaseStats.A,
        weatherExposure: "Within limits",
        memoryConflict: "None",
        status: "selected",
        reason: "Selected: shortest corridor within weather and battery limits.",
      },
      {
        id: "B",
        name: "Route B",
        ...routeBaseStats.B,
        weatherExposure: "Within limits",
        memoryConflict: "None",
        status: "candidate",
        reason: "Eligible but longer distance.",
      },
      {
        id: "C",
        name: "Route C",
        ...routeBaseStats.C,
        weatherExposure: "Within limits",
        memoryConflict: "None",
        status: "candidate",
        reason: "Eligible alternate corridor.",
      },
    ];
    return { rows, selectedRoute: "A" };
  }

  if (memoryBlocksRouteA) {
    const routeCEligible =
      airspaceEval?.routeResults.find((row) => row.id === "C")?.eligible ?? true;
    const selectedAlternate: RouteId = routeCEligible ? "C" : "B";
    const rows: RouteEvalRow[] = [
      {
        id: "A",
        name: "Route A",
        ...routeBaseStats.A,
        weatherExposure: "Within limits",
        memoryConflict: `${blockingMemoryId ?? "Active memory"} active`,
        status: "blocked",
        reason: airspaceBlocksA
          ? `Blocked by ${blockingMemoryId ?? "active memory"} and airspace ceiling / restricted geofence.`
          : `Blocked by ${blockingMemoryId ?? "active memory"}.`,
      },
      {
        id: "B",
        name: "Route B",
        ...routeBaseStats.B,
        weatherExposure: selectedAlternate === "B" ? "Within limits" : "Marginal",
        memoryConflict: "None",
        status: selectedAlternate === "B" ? "selected" : "warning",
        reason:
          selectedAlternate === "B"
            ? "Selected: memory-safe corridor with required FAA constraints satisfied."
            : "Warning due to courtyard approach.",
      },
      {
        id: "C",
        name: "Route C",
        ...routeBaseStats.C,
        weatherExposure: "Within limits",
        memoryConflict: "None",
        status: routeCEligible ? "selected" : "blocked",
        reason: routeCEligible
          ? "Selected as safest available route using shared memory."
          : "Rejected: required FAA/LAANC authorization is unavailable for Mission 2.",
      },
    ];
    return { rows, selectedRoute: selectedAlternate };
  }

  // Airspace blocks Route A; no active memory — prefer the FAA-constrained candidate (B).
  const selectedRoute: RouteId = airspacePreferred && airspacePreferred !== "A" ? airspacePreferred : "B";
  const rows: RouteEvalRow[] = [
    {
      id: "A",
      name: "Route A",
      ...routeBaseStats.A,
      weatherExposure: "Within limits",
      memoryConflict: "None",
      status: "blocked",
      reason: "Blocked: exceeds FAA-constrained candidate corridor and UASFM ceiling.",
    },
    {
      id: "B",
      name: "Route B",
      ...routeBaseStats.B,
      weatherExposure: "Within limits",
      memoryConflict: "None",
      status: selectedRoute === "B" ? "selected" : "candidate",
      reason:
        selectedRoute === "B"
          ? "Selected: stays inside the FAA-constrained candidate corridor."
          : "Eligible FAA-constrained candidate corridor.",
    },
    {
      id: "C",
      name: "Route C",
      ...routeBaseStats.C,
      weatherExposure: "Within limits",
      memoryConflict: "None",
      status: selectedRoute === "C" ? "selected" : "candidate",
      reason:
        selectedRoute === "C"
          ? "Selected: stays inside the FAA-constrained candidate corridor."
          : "Eligible alternate inside the FAA-constrained candidate corridor.",
    },
  ];
  return { rows, selectedRoute };
}

export function buildRoutesStepEvidence(params: {
  rows: RouteEvalRow[];
  selectedRoute: RouteId;
  droneModel: string | null;
  memoryBlocksRouteA: boolean;
  blockingMemoryIds?: string[];
  airspaceBlocksRouteA?: boolean;
}): StepEvidence {
  const {
    rows,
    selectedRoute,
    droneModel,
    memoryBlocksRouteA,
    blockingMemoryIds = [],
    airspaceBlocksRouteA = false,
  } = params;

  return {
    id: "ROUTES",
    title: stepTitles.ROUTES,
    input: [
      "Three fixed route alternatives (A, B, C).",
      `Selected drone: ${droneModel ?? "pending"}.`,
      "Weather result applied from previous step.",
      airspaceBlocksRouteA
        ? "Airspace compliance: Route A exceeds FAA-constrained candidate corridor."
        : "Airspace compliance: all corridors within published constraints.",
      memoryBlocksRouteA
        ? `Active route-matched memories: ${blockingMemoryIds.join(", ")}.`
        : "No active obstacle memories.",
      `Battery reserve requirement: ${BATTERY_RESERVE_PERCENT}%.`,
    ],
    evaluation: rows.map(
      (row) =>
        `${row.name}: ${row.distanceKm} km, ~${row.etaMin} min, weather ${row.weatherExposure}, memory ${row.memoryConflict} — ${row.status}.`,
    ),
    decision: rows.map((row) => `${row.name} ${row.status}: ${row.reason}`).join(" "),
    source: ["Google Maps 3D", "Airtable", "FAA UAS Facility Map (public)", "Deterministic Safety Engine"],
    status: rows.find((row) => row.id === selectedRoute) ? "Completed" : "Failed",
    summary: memoryBlocksRouteA
      ? `Route ${selectedRoute} selected after shared-memory and FAA checks.`
      : airspaceBlocksRouteA
        ? `Route ${selectedRoute} selected inside the FAA-constrained candidate corridor.`
        : `Route A selected. Routes B and C retained as fallbacks.`,
  };
}

/** STEP 7 — deterministic SAFE / CAUTION / UNSAFE mission review. */
export function evaluateMissionRiskReview(mission: Mission): MissionRiskReview {
  const conditions: MissionRiskCondition[] = [];
  const reusingVerifiedSpatialMemory = mission.memories.some(
    (memory) =>
      isMemoryActive(memory) &&
      mission.memoryMatches.some(
        (match) => match.memoryId === memory.id && match.matched,
      ),
  );
  const selectedFleetRow =
    mission.fleetEligibility?.find(
      (row) => row.drone.model === mission.confirmedDrone,
    ) ?? null;
  const selectedDrone = selectedFleetRow?.drone ?? null;
  const selectedRoute =
    mission.routeEval?.find((row) => row.id === mission.selectedRoute) ?? null;
  const selectedAirspace =
    mission.airspaceEval?.routeResults.find(
      (row) => row.id === mission.selectedRoute,
    ) ?? null;

  if (!selectedDrone) {
    conditions.push(
      hardRisk(
        "no-eligible-drone",
        "No drone satisfies all payload, range, battery and weather constraints.",
        "No confirmed drone",
        "An eligible drone is required",
        "Block launch and assign a certified drone.",
      ),
    );
  } else {
    if (mission.input.weightKg > selectedDrone.payloadKg) {
      conditions.push(
        hardRisk(
          "payload-capacity",
          "Payload exceeds the selected drone's certified capacity.",
          `${mission.input.weightKg} kg`,
          `≤ ${selectedDrone.payloadKg} kg`,
          "Block launch and select a higher-capacity drone.",
        ),
      );
    }
    if (selectedDrone.rangeKm < MISSION_RANGE_KM) {
      conditions.push(
        hardRisk(
          "range-capacity",
          "Mission distance exceeds the selected drone's certified range.",
          `${MISSION_RANGE_KM} km required`,
          `≤ ${selectedDrone.rangeKm} km`,
          "Block launch and select a longer-range drone.",
        ),
      );
    }
    const projectedReserve =
      selectedDrone.batteryPercent - ESTIMATED_MISSION_BATTERY_USE_PERCENT;
    if (projectedReserve < BATTERY_RESERVE_PERCENT) {
      conditions.push(
        hardRisk(
          "battery-below-minimum",
          "Projected landing battery reserve is below the hard minimum.",
          `${projectedReserve}% projected reserve`,
          `≥ ${BATTERY_RESERVE_PERCENT}%`,
          "Block launch and recharge or replace the drone.",
        ),
      );
    } else if (
      projectedReserve <= BATTERY_RESERVE_PERCENT + 10
    ) {
      conditions.push({
        id: "battery-near-minimum",
        kind: "BATTERY_RESERVE",
        level: "CAUTION",
        riskDetected: "Projected landing battery reserve is close to the minimum required level.",
        currentValue: `${projectedReserve}% projected (${selectedDrone.batteryPercent}% at launch)`,
        allowedLimit: `Minimum ${BATTERY_RESERVE_PERCENT}%`,
        agentRecommendation: "Use a reduced-speed plan and monitor reserve continuously.",
        proposedAdjustment: "Keep the alternate landing site available and hold if reserve reaches 30%.",
      });
    }
  }

  if (mission.weatherEvaluation?.severity === "UNSAFE") {
    const peak = Math.max(
      mission.weather?.windMph ?? 0,
      mission.weather?.gustMph ?? 0,
    );
    const maximumLimit = Math.max(
      0,
      ...(mission.fleetEligibility ?? [])
        .filter((row) => row.eligible)
        .map((row) => row.drone.windLimitMph),
    );
    conditions.push(
      hardRisk(
        "wind-over-limit",
        "Wind or gust exceeds every eligible drone's certified limit.",
        `${peak} mph peak`,
        `≤ ${maximumLimit} mph`,
        "Block launch until wind returns within certified limits.",
      ),
    );
  } else if (selectedDrone && mission.weather) {
    const selectedWeatherEvaluation =
      mission.weatherEvaluation?.droneEvaluations.find(
        (entry) => entry.drone.model === selectedDrone.model,
      );
    if (
      mission.weatherEvaluation?.severity !== "MODERATE" ||
      !selectedWeatherEvaluation ||
      mission.weatherApprovalGranted
    ) {
      // No operator weather review is needed without a moderate selected-drone result.
    } else {
    const peak = Math.max(mission.weather.windMph, mission.weather.gustMph);
    conditions.push({
      id: "moderate-wind-margin",
      kind: "WEATHER_MARGIN",
      level: "CAUTION",
      riskDetected: "Wind or gust is close to the selected drone's certified limit.",
      currentValue: `${peak} mph peak (${Math.round((peak / selectedDrone.windLimitMph) * 100)}% utilization)`,
      allowedLimit: `≤ ${selectedDrone.windLimitMph} mph`,
      agentRecommendation: "Approve only with the deterministic reduced-speed weather plan.",
      proposedAdjustment: `Reduce cruise speed to ${mission.cruiseSpeedMph} mph; ETA +${mission.etaDeltaMin} min.`,
    });
    }
  }

  const lowConfidenceMemories = mission.memories.filter(
    (memory) =>
      memory.confidence < 0.75 &&
      mission.memoryMatches.some(
        (match) => match.memoryId === memory.id && match.matched,
      ),
  );
  if (lowConfidenceMemories.length > 0) {
    conditions.push({
      id: "low-confidence-obstacle",
      kind: "OBSTACLE_CONFIDENCE",
      level: "CAUTION",
      riskDetected: "A route-adjacent obstacle was detected with low confidence.",
      currentValue: `${Math.round(Math.min(...lowConfidenceMemories.map((memory) => memory.confidence)) * 100)}% confidence`,
      allowedLimit: "≥ 75% for autonomous rerouting",
      agentRecommendation: "Pause for operator review instead of treating the obstacle as confirmed.",
      proposedAdjustment: "Avoid the uncertain corridor and re-scan before flight resumes.",
    });
  }

  if (
    mission.pattern === "MISSION_2" &&
    reusingVerifiedSpatialMemory &&
    mission.selectedRoute === "B"
  ) {
    conditions.push({
      id: "shared-memory-route-change",
      kind: "ROUTE_ADJUSTMENT",
      level: "CAUTION",
      riskDetected:
        "Route A is blocked by verified crane memory; Route C lacks available FAA/LAANC authorization.",
      currentValue: "Preflight proposes Route B",
      allowedLimit: "Operator approval required before changing the planned corridor",
      agentRecommendation: "Approve Route B before takeoff.",
      proposedAdjustment: "Change Route A → Route B before launch.",
    });
  }

  if (selectedAirspace && !selectedAirspace.eligible) {
    conditions.push(
      hardRisk(
        "restricted-airspace-violation",
        "Selected route violates an airspace ceiling or restricted geofence.",
        `Route ${selectedAirspace.id}: ${selectedAirspace.plannedAglFt} ft AGL`,
        `Eligible corridor at or below ${mission.airspaceEval?.maxAltitudeAglFt ?? "published"} ft AGL`,
        "Block launch and select a compliant corridor.",
      ),
    );
  } else if (
    mission.selectedRoute === "A" &&
    !(mission.isDemoPreset && mission.pattern === "MISSION_1")
  ) {
    conditions.push({
      id: "restricted-airspace-proximity",
      kind: "AIRSPACE_PROXIMITY",
      level: "CAUTION",
      riskDetected: "Selected route passes close to the restricted dockside geofence.",
      currentValue: "Route A requires live monitoring near the active geofence",
      allowedLimit: "No entry into GF-RESTRICTED-DOCK",
      agentRecommendation:
        mission.pattern === "MISSION_1"
          ? "Retain Route A for the controlled sensor demo with continuous geofence monitoring."
          : "Prefer the compliant Route B corridor.",
      proposedAdjustment:
        mission.pattern === "MISSION_1"
          ? "Keep Route A and hold immediately if live sensing finds a corridor conflict."
          : "Switch Route A → Route B; estimated ETA +2 min.",
    });
  }

  if (
    selectedAirspace &&
    mission.airspaceEval &&
    !(mission.isDemoPreset && mission.pattern === "MISSION_1") &&
    !reusingVerifiedSpatialMemory &&
    selectedAirspace.plannedAglFt >= mission.airspaceEval.maxAltitudeAglFt * 0.95
  ) {
    conditions.push({
      id: "altitude-margin",
      kind: "ROUTE_ADJUSTMENT",
      level: "CAUTION",
      riskDetected: "Planned altitude has a narrow margin below the published ceiling.",
      currentValue: `${selectedAirspace.plannedAglFt} ft AGL`,
      allowedLimit: `≤ ${mission.airspaceEval.maxAltitudeAglFt} ft AGL`,
      agentRecommendation: "Use a lower altitude inside the eligible corridor.",
      proposedAdjustment: `Reduce planned altitude by 10 ft; retain Route ${selectedAirspace.id}.`,
    });
  }

  if (
    selectedRoute &&
    !reusingVerifiedSpatialMemory &&
    (selectedRoute.etaMin > routeBaseStats.A.etaMin || mission.etaDeltaMin > 0)
  ) {
    const totalImpact =
      selectedRoute.etaMin - routeBaseStats.A.etaMin + mission.etaDeltaMin;
    conditions.push({
      id: "route-eta-impact",
      kind: "ROUTE_ADJUSTMENT",
      level: "CAUTION",
      riskDetected: "The safer route or operating adjustment increases ETA.",
      currentValue: `Route ${selectedRoute.id}: ~${selectedRoute.etaMin + mission.etaDeltaMin} min`,
      allowedLimit: `Baseline Route A: ~${routeBaseStats.A.etaMin} min`,
      agentRecommendation: "Accept the delay only if the safety-adjusted route remains operationally appropriate.",
      proposedAdjustment: `Use Route ${selectedRoute.id}; ETA +${Math.max(1, totalImpact)} min.`,
    });
  }

  const allRoutesBlocked = Boolean(
    mission.routeEval?.length &&
      mission.routeEval.every((route) => route.status === "blocked"),
  );
  if (allRoutesBlocked) {
    conditions.push(
      hardRisk(
        "all-routes-blocked",
        "Every route is blocked by deterministic safety constraints.",
        "0 eligible routes",
        "At least 1 compliant route required",
        "Block the mission until a compliant route exists.",
      ),
    );
  }

  const level = conditions.some((condition) => condition.level === "UNSAFE")
    ? "UNSAFE"
    : conditions.length > 0
      ? "CAUTION"
      : "SAFE";
  return {
    level,
    conditions,
    summary:
      level === "SAFE"
        ? "All deterministic checks have sufficient safety margin."
        : level === "CAUTION"
          ? `${conditions.length} related caution condition${conditions.length === 1 ? "" : "s"} grouped for one operator review.`
          : `${conditions.filter((condition) => condition.level === "UNSAFE").length} hard safety failure${conditions.filter((condition) => condition.level === "UNSAFE").length === 1 ? "" : "s"} block the mission automatically.`,
  };
}

export function buildApprovalStepEvidence(
  review: MissionRiskReview,
  operatorDecision?: "APPROVED" | "HELD" | "REJECTED" | "TIMED_OUT",
): StepEvidence {
  const approved = review.level === "CAUTION" && operatorDecision === "APPROVED";
  const status: StepEvidence["status"] =
    review.level === "UNSAFE" || operatorDecision === "REJECTED"
      ? "Failed"
      : review.level === "CAUTION" && !approved
        ? "Approval"
        : review.level === "CAUTION"
          ? "Warning"
          : "Completed";
  return {
    id: "APPROVAL",
    title: stepTitles.APPROVAL,
    input: [
      "Grouped deterministic mission risk review.",
      "Payload, range, battery, weather, memory, route, airspace and delivery constraints.",
    ],
    evaluation:
      review.conditions.length > 0
        ? review.conditions.map(
            (condition) =>
              `${condition.level} · ${condition.riskDetected} Current: ${condition.currentValue}. Limit: ${condition.allowedLimit}.`,
          )
        : ["SAFE — no caution or hard-limit condition detected."],
    decision:
      review.level === "UNSAFE"
        ? "UNSAFE: mission automatically blocked. Human approval cannot override hard safety limits."
        : review.level === "CAUTION"
          ? approved
            ? "CAUTION approved by operator. Apply every proposed adjustment before launch."
            : operatorDecision === "REJECTED"
              ? "Operator rejected the caution plan. Mission blocked."
              : "CAUTION: mission paused and one grouped Slack approval requested."
          : "SAFE: continue automatically without sending Slack.",
    source:
      review.level === "CAUTION"
        ? ["Deterministic Safety Engine", "Slack"]
        : ["Deterministic Safety Engine", "Slack not contacted"],
    status,
    summary:
      operatorDecision === "TIMED_OUT"
        ? "Approval timed out; mission remains paused."
        : operatorDecision === "HELD"
          ? "Operator kept the mission on hold."
          : review.summary,
  };
}

function hardRisk(
  id: string,
  riskDetected: string,
  currentValue: string,
  allowedLimit: string,
  proposedAdjustment: string,
): MissionRiskCondition {
  return {
    id,
    kind: "HARD_SAFETY_LIMIT",
    level: "UNSAFE",
    riskDetected,
    currentValue,
    allowedLimit,
    agentRecommendation: "Do not request an override.",
    proposedAdjustment,
  };
}

/** STEP 8 — Build Approved Mission Plan. */
export function buildApprovedPlan(params: {
  version: 1 | 2;
  droneModel: string;
  routeId: RouteId;
  speedMph: number;
  primaryDropOff: string;
  backupDropOff: string;
  memoriesUsed: string[];
  weatherTimestamp: string;
  approvalStatus: string;
}): ApprovedPlan {
  return {
    version: params.version,
    droneModel: params.droneModel,
    routeId: params.routeId,
    speedMph: params.speedMph,
    altitudeCorridor: "≤200 ft AGL FAA-constrained candidate corridor",
    batteryReserve: `${BATTERY_RESERVE_PERCENT}% minimum reserve`,
    primaryDropOff: params.primaryDropOff,
    backupDropOff: params.backupDropOff,
    memoriesUsed: params.memoriesUsed,
    weatherTimestamp: params.weatherTimestamp,
    approvalStatus: params.approvalStatus,
  };
}

export function buildReadyStepEvidence(plan: ApprovedPlan): StepEvidence {
  return {
    id: "READY",
    title: stepTitles.READY,
    input: [
      `Confirmed drone: ${plan.droneModel}`,
      `Confirmed route: Route ${plan.routeId}`,
      `Planned speed: ${plan.speedMph} mph`,
      `Memories used: ${plan.memoriesUsed.length > 0 ? plan.memoriesUsed.join(", ") : "None"}`,
      `Human approval: ${plan.approvalStatus}`,
    ],
    evaluation: [
      "Compiled selected drone, route, and speed into Approved Plan V1.",
      `Altitude corridor set: ${plan.altitudeCorridor}.`,
      `Battery reserve requirement recorded: ${plan.batteryReserve}.`,
      `Primary drop-off: ${plan.primaryDropOff}. Backup: ${plan.backupDropOff}.`,
      `Weather snapshot timestamp attached: ${plan.weatherTimestamp}.`,
    ],
    decision: "Mission package validated and ready to launch.",
    source: ["Mission Agent", "Airtable", "OpenWeather", "Google Maps", "Slack status"],
    status: "Completed",
    summary: "Approved Plan V1 ready. Launch Mission enabled.",
  };
}

export function formatTimestampShort(value: string) {
  return value.replace("T", " ").replace(".000Z", " UTC");
}


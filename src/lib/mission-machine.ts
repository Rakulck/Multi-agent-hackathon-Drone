import {
  activeAirspaceRestrictions,
  airspacePreferredRoute,
  airspaceRouteCompliance,
  airspaceSnapshotMeta,
} from "@/data/demo-airspace";
import { apartmentDestination, craneHazard, dispatchOrigin, initialRouteStatuses } from "@/data/demo-routes";
import { fleetDrones, weatherSnapshotData } from "@/data/demo-dashboard";
import { buildMissionMapScene, defaultMapScene } from "@/lib/map/route-warp";
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
  MissionMapScene,
  MissionState,
  NewMissionInput,
  OperationalMemory,
  PreflightStepId,
  RouteEvalRow,
  RouteId,
  RouteStatus,
  StepEvidence,
  WeatherSnapshotData,
} from "@/types/domain";
import { preflightStepOrder } from "@/types/domain";

export const groceryOrder = {
  id: "ORDER-GROCERY-045",
  payloadKg: 4.5,
  destination: "Apartment delivery zone",
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

export function createCraneMemory(): OperationalMemory {
  return {
    id: "MEM-CRANE-001",
    learnedBy: "Atlas HeavyLift",
    routeId: "A",
    hazardType: "temporary crane",
    severity: "High",
    confidence: 0.94,
    createdAt: "2026-09-13T08:32:00.000Z",
    expiresAt: "2026-09-14T08:32:00.000Z",
    summary: `Blocked aerial corridor near ${craneHazard.label}; avoid Route A before takeoff.`,
    altitudeBandM: [90, 148],
    avoidanceRadiusM: 120,
    airtableStatus: "saving",
  };
}

export function markMemorySaved(memory: OperationalMemory): OperationalMemory {
  return { ...memory, airtableStatus: "saved" };
}

export function markMemoryUsed(memory: OperationalMemory, usedBy: string): OperationalMemory {
  return {
    ...memory,
    usedBy,
  };
}

export function isMemoryActive(memory: OperationalMemory | null): memory is OperationalMemory {
  return Boolean(memory && new Date(memory.expiresAt).getTime() > Date.now());
}

export function interpolateRoute(routes: DemoRoute[], routeId: RouteId, progress: number): GeoPoint3D {
  const route = routes.find((candidate) => candidate.id === routeId);

  if (!route) {
    throw new Error(`Unknown route ${routeId}.`);
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const segments = route.waypoints.length - 1;
  const rawIndex = clampedProgress * segments;
  const index = Math.min(Math.floor(rawIndex), segments - 1);
  const localProgress = rawIndex - index;
  const start = route.waypoints[index];
  const end = route.waypoints[index + 1];

  return {
    lat: lerp(start.lat, end.lat, localProgress),
    lng: lerp(start.lng, end.lng, localProgress),
    altitude: lerp(start.altitude, end.altitude, localProgress),
  };
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
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

  if (status === "OBSTACLE DETECTED") {
    return "HOLD";
  }

  if (status === "REROUTING") {
    return "REROUTING";
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

const MAX_INTEGRATION_EVENTS = 5;

/**
 * Appends a new integration-flow placeholder event, marking any previously
 * "Processing" step as "Completed" first. Only typed placeholders are
 * created here — no external API is ever called from this helper.
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
    return defaultMapScene;
  }

  return buildMissionMapScene({
    origin: { lat: input.pickupPlace.lat, lng: input.pickupPlace.lng, altitude: dispatchOrigin.altitude },
    destination: { lat: input.dropPlace.lat, lng: input.dropPlace.lng, altitude: apartmentDestination.altitude },
    originLabel: input.pickupPlace.label,
    destinationLabel: input.dropPlace.label,
    isCustomAddress: true,
  });
}

export function createMission(input: NewMissionInput): Mission {
  missionCounter += 1;

  return {
    id: `mission-${Date.now()}-${missionCounter}`,
    label: `Mission ${missionCounter}`,
    createdAt: formatClockTime(new Date()),
    input,
    lifecycle: "NEW",
    pattern: "MISSION_1",
    steps: makeEmptyStepEvidence(),
    activeStepId: null,
    fleetEligibility: null,
    provisionalDrone: null,
    confirmedDrone: null,
    cruiseSpeedMph: null,
    etaDeltaMin: 0,
    routeEval: null,
    selectedRoute: null,
    airspaceEval: null,
    approvalRequired: false,
    plan: null,
    mapScene: buildMapSceneForInput(input),
  };
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
    source: ["Agent", "Gemini (simulated request normalization)"],
    status: "Completed",
    summary: `${input.weightKg} kg ${input.priority.toLowerCase()} ${input.deliveryType.toLowerCase()} mission validated.`,
  };
}

/** STEP 2 — Evaluate Fleet. */
export function fleetSnapshotForPreflight(fleet: FleetDrone[], memory: OperationalMemory | null): FleetDrone[] {
  if (isMemoryActive(memory)) {
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

    if (drone.batteryPercent < BATTERY_RESERVE_PERCENT) {
      return {
        drone,
        eligible: false,
        reason: `${drone.model} rejected: battery ${drone.batteryPercent}% below ${BATTERY_RESERVE_PERCENT}% reserve.`,
      };
    }

    if (!hasCapability) {
      return { drone, eligible: false, reason: `${drone.model} rejected: lacks required ${requiredCapability}.` };
    }

    return {
      drone,
      eligible: true,
      reason: `${drone.model} approved: availability, payload, range, battery reserve, and cargo capability confirmed.`,
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
      "Drone availability and capabilities loaded from Airtable fleet table.",
    ],
    evaluation: rows.map((row) => `${row.drone.model}: ${row.reason}`),
    decision: provisional
      ? `${rows.length - eligibleCount} of ${rows.length} drones rejected. Provisional selection: ${provisional.drone.model}.`
      : "No eligible drone found for this payload.",
    source: ["Airtable", "Deterministic Agent Rules"],
    status: provisional ? "Completed" : "Failed",
    summary: `${eligibleCount} of ${rows.length} drones eligible. ${
      provisional ? `${provisional.drone.model} provisionally selected.` : "No eligible drone."
    }`,
  };
}

/** STEP 3 — Evaluate Weather. */
export function evaluateWeatherForDrones(rows: FleetEvalRow[], weather: WeatherSnapshotData) {
  const eligible = rows.filter((row) => row.eligible);
  const withRisk = eligible.map((row) => ({ row, riskCandidate: weather.gustMph > row.drone.windLimitMph }));
  const confirmedEntry = withRisk.find((entry) => !entry.riskCandidate) ?? withRisk[0] ?? null;
  const reduction = confirmedEntry?.riskCandidate ? 6 : 4;
  const cruiseSpeedMph = confirmedEntry ? BASE_CRUISE_SPEED_MPH - reduction : null;
  const etaDeltaMin = confirmedEntry ? (confirmedEntry.riskCandidate ? 2 : 1) : 0;

  return {
    withRisk,
    confirmed: confirmedEntry?.row.drone ?? null,
    riskFlag: confirmedEntry?.riskCandidate ?? false,
    cruiseSpeedMph,
    etaDeltaMin,
  };
}

export function buildWeatherStepEvidence(params: {
  weather: WeatherSnapshotData;
  withRisk: Array<{ row: FleetEvalRow; riskCandidate: boolean }>;
  confirmed: FleetDrone | null;
  riskFlag: boolean;
  cruiseSpeedMph: number | null;
  etaDeltaMin: number;
}): StepEvidence {
  const { weather, withRisk, confirmed, riskFlag, cruiseSpeedMph, etaDeltaMin } = params;

  const riskCandidates = withRisk.filter((entry) => entry.riskCandidate && entry.row.drone.model !== confirmed?.model);

  const evaluation = withRisk.map(
    (entry) =>
      `${entry.row.drone.model} limit: ${entry.row.drone.windLimitMph} mph vs current gust ${weather.gustMph} mph — ${
        entry.riskCandidate ? "risk candidate" : "within threshold"
      }.`,
  );

  const decisionParts: string[] = [];
  riskCandidates.forEach((entry) => {
    decisionParts.push(`${entry.row.drone.model} becomes a weather-risk candidate because gusts exceed its preferred threshold.`);
  });
  if (confirmed) {
    decisionParts.push(
      riskFlag
        ? `${confirmed.model} remains the only eligible drone; proceeding with reduced cruise speed.`
        : `${confirmed.model} remains within its operating threshold. Confirmed.`,
    );
    decisionParts.push(`Reduce planned cruise speed from ${BASE_CRUISE_SPEED_MPH} mph to ${cruiseSpeedMph} mph.`);
    decisionParts.push(`Increase ETA by ${etaDeltaMin} minute${etaDeltaMin === 1 ? "" : "s"}.`);
  }

  return {
    id: "WEATHER",
    title: stepTitles.WEATHER,
    input: [
      `Wind: ${weather.windMph} mph`,
      `Gust: ${weather.gustMph} mph`,
      `Visibility: ${weather.visibilityMiles} miles`,
      `Temperature: ${weather.temperatureF}°F`,
      `Last updated: ${weather.updatedAt}`,
    ],
    evaluation,
    decision: decisionParts.join(" "),
    source: ["OpenWeather", "Deterministic Agent Rules"],
    status: confirmed ? (riskFlag ? "Warning" : "Completed") : "Failed",
    summary: confirmed
      ? `${confirmed.model} confirmed. Cruise speed reduced to ${cruiseSpeedMph} mph.`
      : "No eligible drone survives weather evaluation.",
  };
}

/** STEP 4 — Airspace Compliance. */
export function evaluateAirspaceForMission(): AirspaceEval {
  const routeResults: AirspaceRouteResult[] = (["A", "B", "C"] as RouteId[]).map((id) => {
    const compliance = airspaceRouteCompliance[id];
    return {
      id,
      name: `Route ${id}`,
      eligible: compliance.eligible,
      plannedAglFt: compliance.plannedAglFt,
      reason: compliance.reason,
    };
  });

  const eligible = routeResults.filter((row) => row.eligible).map((row) => row.name);
  const preferred = airspacePreferredRoute;

  return {
    airspaceClass: airspaceSnapshotMeta.airspaceClass,
    maxAltitudeAglFt: airspaceSnapshotMeta.maxAltitudeAglFt,
    authorizationRequired: airspaceSnapshotMeta.authorizationRequired,
    laancAuthorized: false,
    restrictions: activeAirspaceRestrictions.map((restriction) => ({ ...restriction })),
    routeResults,
    preferredRoute: preferred,
    dataSource: airspaceSnapshotMeta.dataSource,
    timestamp: airspaceSnapshotMeta.updatedAt,
    facilityMapGrid: airspaceSnapshotMeta.facilityMapGrid,
    decision: `Route A exceeds the permitted corridor. ${eligible.join(" and ")} remain eligible. Route ${preferred} selected.`,
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
    source: ["FAA UAS Facility Map (public)", "Mock TFR/NOTAM", "Mock LAANC status", "Agent"],
    status: evalResult.authorizationRequired ? "Warning" : "Completed",
    summary: `Max ${evalResult.maxAltitudeAglFt} ft AGL. Auth required: ${
      evalResult.authorizationRequired ? "Yes" : "No"
    }. Route ${evalResult.preferredRoute} preferred.`,
  };
}

/** STEP 5 — Retrieve Shared Memory. */
export function buildMemoryStepEvidence(memory: OperationalMemory | null): StepEvidence {
  const active = isMemoryActive(memory);

  const input = [
    "Candidate route corridors: A, B, C",
    "Destination coordinates resolved.",
    "Altitude bands loaded for each corridor.",
    `Current time: ${formatClockTime(new Date())}`,
    active && memory ? `Active Airtable memory record: ${memory.id}` : "Active Airtable memory records: none",
  ];

  const evaluation = active && memory
    ? [
        `Geographic overlap: ${memory.routeId === "A" ? "Route A corridor intersects hazard polygon." : "No overlap."}`,
        `Altitude overlap: ${memory.altitudeBandM[0]}-${memory.altitudeBandM[1]} m within cruise corridor.`,
        `Severity: ${memory.severity}.`,
        `Confidence: ${Math.round(memory.confidence * 100)}%.`,
        `Expiration: ${formatTimestampShort(memory.expiresAt)} (still active).`,
        "Verification status: verified by originating drone.",
      ]
    : [
        "Geographic overlap: none detected against active records.",
        "Altitude overlap: none detected against active records.",
        "Severity: n/a.",
        "Confidence: n/a.",
        "Expiration: n/a.",
        "Verification status: no records to verify.",
      ];

  return {
    id: "MEMORY",
    title: stepTitles.MEMORY,
    input,
    evaluation,
    decision:
      active && memory
        ? `${memory.id} overlaps Route A and remains active. Route A must be rejected before takeoff.`
        : "No active memory affects this destination. Continue with all three candidate routes.",
    source: ["Airtable", "Shared Intelligence Layer"],
    status: active ? "Warning" : "Completed",
    summary: active ? `${memory?.id ?? "MEM-CRANE-001"} retrieved. Route A rejected.` : "No relevant active memories.",
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
    const rows: RouteEvalRow[] = [
      {
        id: "A",
        name: "Route A",
        ...routeBaseStats.A,
        weatherExposure: "Within limits",
        memoryConflict: "MEM-CRANE-001 active",
        status: "blocked",
        reason: airspaceBlocksA
          ? "Blocked by MEM-CRANE-001 and airspace ceiling / restricted geofence."
          : "Blocked by MEM-CRANE-001.",
      },
      {
        id: "B",
        name: "Route B",
        ...routeBaseStats.B,
        weatherExposure: "Marginal",
        memoryConflict: "None",
        status: "warning",
        reason: "Warning due to courtyard approach.",
      },
      {
        id: "C",
        name: "Route C",
        ...routeBaseStats.C,
        weatherExposure: "Within limits",
        memoryConflict: "None",
        status: "selected",
        reason: "Selected as safest available route using shared memory.",
      },
    ];
    return { rows, selectedRoute: "C" };
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
  airspaceBlocksRouteA?: boolean;
}): StepEvidence {
  const { rows, selectedRoute, droneModel, memoryBlocksRouteA, airspaceBlocksRouteA = false } = params;

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
      memoryBlocksRouteA ? "Active obstacle memory: MEM-CRANE-001." : "No active obstacle memories.",
      `Battery reserve requirement: ${BATTERY_RESERVE_PERCENT}%.`,
    ],
    evaluation: rows.map(
      (row) =>
        `${row.name}: ${row.distanceKm} km, ~${row.etaMin} min, weather ${row.weatherExposure}, memory ${row.memoryConflict} — ${row.status}.`,
    ),
    decision: rows.map((row) => `${row.name} ${row.status}: ${row.reason}`).join(" "),
    source: ["Google Maps 3D", "Airtable", "FAA UAS Facility Map (public)", "Agent"],
    status: rows.find((row) => row.id === selectedRoute) ? "Completed" : "Failed",
    summary: memoryBlocksRouteA
      ? `Route C selected using shared memory.`
      : airspaceBlocksRouteA
        ? `Route ${selectedRoute} selected inside the FAA-constrained candidate corridor.`
        : `Route A selected. Routes B and C retained as fallbacks.`,
  };
}

/** STEP 7 — Check Human Approval. */
export function isApprovalRequired(rows: RouteEvalRow[] | null): boolean {
  if (!rows) {
    return false;
  }
  return rows.every((row) => row.status === "blocked");
}

export function buildApprovalStepEvidence(required: boolean): StepEvidence {
  return {
    id: "APPROVAL",
    title: stepTitles.APPROVAL,
    input: [
      "Route evaluation result.",
      "Weather evaluation result.",
      "Battery reserve confirmation.",
      "Drop-off zone availability.",
    ],
    evaluation: [
      "All routes blocked? No.",
      "Obstacle confidence low? No.",
      "Weather near or above safety limits? No.",
      "Battery reserve uncertain? No.",
      "Required safety data unavailable? No.",
      "Primary and alternate drop-off zones blocked? No.",
    ],
    decision: required
      ? "Human approval required before launch. Operator notified via Slack."
      : "No human approval required. All deterministic safety checks passed.",
    source: required ? ["Agent", "Slack"] : ["Agent", "Slack marked as Standby"],
    status: required ? "Warning" : "Completed",
    summary: required ? "Waiting for operator decision." : "Autonomous launch approved.",
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
    source: ["Agent", "Airtable", "OpenWeather", "Google Maps", "Slack status"],
    status: "Completed",
    summary: "Approved Plan V1 ready. Launch Mission enabled.",
  };
}

export function formatTimestampShort(value: string) {
  return value.replace("T", " ").replace(".000Z", " UTC");
}

export const defaultWeatherSnapshot: WeatherSnapshotData = weatherSnapshotData;

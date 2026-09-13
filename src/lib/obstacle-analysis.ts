import { z } from "zod";
import type {
  DemoRoute,
  GeminiObstacleObservation,
  GeminiObservationSource,
  GeoPoint3D,
  ObstacleSafetyDecision,
  OperationalMemory,
  RouteId,
} from "@/types/domain";

export const geminiObstacleObservationSchema = z
  .object({
    obstacleDetected: z.boolean(),
    obstacleType: z.literal("CONSTRUCTION_CRANE"),
    description: z.string().trim().min(1).max(600),
    confidence: z.number().finite().min(0).max(1),
    estimatedCoordinates: z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    }),
    minimumAltitudeM: z.number().finite().min(0).max(1_000),
    maximumAltitudeM: z.number().finite().min(0).max(1_000),
    recommendedMemoryTtlMinutes: z.number().finite().int().min(1).max(10_080),
  })
  .strict()
  .refine(
    (observation) =>
      observation.minimumAltitudeM <= observation.maximumAltitudeM,
    {
      message: "minimumAltitudeM must not exceed maximumAltitudeM",
      path: ["minimumAltitudeM"],
    },
  );

export const geminiResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    obstacleDetected: { type: "boolean" },
    obstacleType: {
      type: "string",
      enum: ["CONSTRUCTION_CRANE"],
    },
    description: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    estimatedCoordinates: {
      type: "object",
      additionalProperties: false,
      properties: {
        latitude: { type: "number", minimum: -90, maximum: 90 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
      },
      required: ["latitude", "longitude"],
    },
    minimumAltitudeM: { type: "number", minimum: 0 },
    maximumAltitudeM: { type: "number", minimum: 0 },
    recommendedMemoryTtlMinutes: {
      type: "integer",
      minimum: 1,
      maximum: 10_080,
    },
  },
  required: [
    "obstacleDetected",
    "obstacleType",
    "description",
    "confidence",
    "estimatedCoordinates",
    "minimumAltitudeM",
    "maximumAltitudeM",
    "recommendedMemoryTtlMinutes",
  ],
} as const;

export interface ObstacleAnalysisContext {
  missionId: string;
  droneId: string;
  sourceVendor: string;
  currentRoute: RouteId;
  droneCoordinates: {
    latitude: number;
    longitude: number;
  };
  altitudeM: number;
  routeWaypoints: GeoPoint3D[];
}

const HORIZONTAL_AVOIDANCE_RADIUS_M = 120;

export function parseGeminiObstacleObservation(
  text: string,
): GeminiObstacleObservation {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }

  const result = geminiObstacleObservationSchema.safeParse(decoded);
  if (!result.success) {
    throw new Error("Gemini response failed obstacle schema validation.");
  }
  return result.data;
}

export function evaluateObstacleSafety(
  observation: GeminiObstacleObservation,
  context: Pick<ObstacleAnalysisContext, "currentRoute" | "routeWaypoints">,
): ObstacleSafetyDecision {
  if (!observation.obstacleDetected) {
    return {
      action: "CONTINUE",
      reason:
        "Gemini observation reports no obstacle; deterministic rules permit the mission to continue.",
      affectedRoute: null,
      routeOverlap: false,
      altitudeOverlap: false,
      relevantForMemory: false,
    };
  }

  const routeOverlap =
    minimumRouteDistanceM(
      observation.estimatedCoordinates.latitude,
      observation.estimatedCoordinates.longitude,
      context.routeWaypoints,
    ) <= HORIZONTAL_AVOIDANCE_RADIUS_M;
  const routeAltitudes = context.routeWaypoints.map(
    (waypoint) => waypoint.altitude,
  );
  const routeMinimumAltitudeM = Math.min(...routeAltitudes);
  const routeMaximumAltitudeM = Math.max(...routeAltitudes);
  const altitudeOverlap =
    routeMaximumAltitudeM >= observation.minimumAltitudeM &&
    routeMinimumAltitudeM <= observation.maximumAltitudeM;
  const overlapExists = routeOverlap && altitudeOverlap;

  if (observation.confidence >= 0.8 && overlapExists) {
    return {
      action: "REROUTE",
      reason: `Confidence is ${formatConfidence(observation.confidence)} and Route ${context.currentRoute} overlaps the obstacle in location and altitude; deterministic rules reject the route.`,
      affectedRoute: context.currentRoute,
      routeOverlap,
      altitudeOverlap,
      relevantForMemory: true,
    };
  }

  if (observation.confidence < 0.5) {
    return {
      action: "HOLD_FOR_HUMAN_REVIEW",
      reason: `Confidence is ${formatConfidence(observation.confidence)}; the observation is unverified, so deterministic rules require a safe hold and human review.`,
      affectedRoute: overlapExists ? context.currentRoute : null,
      routeOverlap,
      altitudeOverlap,
      relevantForMemory: false,
    };
  }

  if (observation.confidence < 0.8) {
    return {
      action: "HOLD_FOR_HUMAN_REVIEW",
      reason: `Confidence is ${formatConfidence(observation.confidence)}; deterministic rules require a safe hold and human review.`,
      affectedRoute: overlapExists ? context.currentRoute : null,
      routeOverlap,
      altitudeOverlap,
      relevantForMemory: false,
    };
  }

  return {
    action: "CONTINUE",
    reason:
      "The high-confidence obstacle does not overlap the current route in both location and altitude, so it is not relevant to this route.",
    affectedRoute: null,
    routeOverlap,
    altitudeOverlap,
    relevantForMemory: false,
  };
}

export function makeGeminiFailureDecision(
  reason = "Gemini perception is unavailable; deterministic rules require a safe hold.",
): ObstacleSafetyDecision {
  return {
    action: "GEMINI_API_FAILURE",
    reason,
    affectedRoute: null,
    routeOverlap: false,
    altitudeOverlap: false,
    relevantForMemory: false,
  };
}

export function makeDemoFallbackObservation(
  context: Pick<ObstacleAnalysisContext, "droneCoordinates" | "altitudeM">,
): GeminiObstacleObservation {
  return {
    obstacleDetected: true,
    obstacleType: "CONSTRUCTION_CRANE",
    description:
      "DEMO_FALLBACK: a tower construction crane extends into the simulated flight corridor.",
    confidence: 0.94,
    estimatedCoordinates: {
      latitude: context.droneCoordinates.latitude,
      longitude: context.droneCoordinates.longitude,
    },
    minimumAltitudeM: Math.max(0, Math.round(context.altitudeM - 40)),
    maximumAltitudeM: Math.round(context.altitudeM + 22),
    recommendedMemoryTtlMinutes: 1_440,
  };
}

export function createObstacleMemory(params: {
  observation: GeminiObstacleObservation;
  decision: ObstacleSafetyDecision;
  context: ObstacleAnalysisContext;
  source: GeminiObservationSource;
  now?: Date;
}): OperationalMemory {
  if (!params.decision.relevantForMemory || !params.decision.affectedRoute) {
    throw new Error("An irrelevant observation cannot create operational memory.");
  }

  const now = params.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() +
      params.observation.recommendedMemoryTtlMinutes * 60 * 1_000,
  );
  const location = params.observation.estimatedCoordinates;

  return {
    id: `MEM-CRANE-${Math.round(location.latitude * 100_000)}-${Math.round(Math.abs(location.longitude) * 100_000)}-${now.getTime()}`,
    learnedBy: params.context.droneId,
    routeId: params.decision.affectedRoute,
    hazardType: params.observation.obstacleType,
    latitude: location.latitude,
    longitude: location.longitude,
    severity: params.observation.confidence >= 0.9 ? "High" : "Medium",
    confidence: params.observation.confidence,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    summary: `${params.observation.description} Route ${params.decision.affectedRoute} rejected by deterministic location and altitude rules.`,
    altitudeBandM: [
      params.observation.minimumAltitudeM,
      params.observation.maximumAltitudeM,
    ],
    avoidanceRadiusM: HORIZONTAL_AVOIDANCE_RADIUS_M,
    sourceVendor: params.context.sourceVendor,
    sourceMission: params.context.missionId,
    status: "Inactive",
    verificationStatus: "Awaiting Verification",
    dataSource:
      params.source === "GEMINI" ? "AIRTABLE" : "DEMO_FALLBACK",
    airtableStatus: "draft",
  };
}

function minimumRouteDistanceM(
  latitude: number,
  longitude: number,
  waypoints: GeoPoint3D[],
) {
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
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, -(startX * dx + startY * dy) / lengthSquared),
          );
    minimum = Math.min(
      minimum,
      Math.hypot(startX + progress * dx, startY + progress * dy),
    );
  }

  return minimum;
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function getRouteForContext(
  routeId: RouteId,
  routes: DemoRoute[],
): DemoRoute | null {
  return routes.find((route) => route.id === routeId) ?? null;
}

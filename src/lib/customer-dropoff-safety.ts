import type { GeoPoint3D } from "@/types/domain";

export interface AlternativeDropOff {
  name: "Terrace" | "Front Entrance";
  point: GeoPoint3D;
}

export interface AlternativeSafetyContext {
  primaryPoint: GeoPoint3D;
  blockedZones: Array<{ center: GeoPoint3D; radiusM: number }>;
  routeEligible: boolean;
  weatherSafe: boolean;
  batteryReservePercent: number;
}

export interface AlternativeSafetyDecision {
  result: "SAFE" | "UNSAFE";
  reason: string;
}

const MINIMUM_BATTERY_RESERVE_PERCENT = 30;
const MAXIMUM_DIVERSION_DISTANCE_M = 1_000;

/**
 * Hard, deterministic checks for a customer-selected alternate. Customer
 * preference is only an input; it cannot bypass these constraints.
 */
export function validateAlternativeDropOff(
  alternative: AlternativeDropOff,
  context: AlternativeSafetyContext,
): AlternativeSafetyDecision {
  if (!context.routeEligible) {
    return unsafe("The final-approach route is not eligible.");
  }
  if (!context.weatherSafe) {
    return unsafe("Weather is outside the approved operating envelope.");
  }
  if (context.batteryReservePercent < MINIMUM_BATTERY_RESERVE_PERCENT) {
    return unsafe(
      `Projected battery reserve is below ${MINIMUM_BATTERY_RESERVE_PERCENT}%.`,
    );
  }
  if (!isValidPoint(alternative.point)) {
    return unsafe("The alternate location coordinates are invalid.");
  }

  const diversionDistanceM = distanceMeters(
    context.primaryPoint,
    alternative.point,
  );
  if (diversionDistanceM > MAXIMUM_DIVERSION_DISTANCE_M) {
    return unsafe("The alternate location is outside the approved diversion radius.");
  }

  const blocked = context.blockedZones.some(
    (zone) =>
      distanceMeters(zone.center, alternative.point) <= Math.max(0, zone.radiusM),
  );
  if (blocked) {
    return unsafe("The alternate location overlaps a deterministically blocked zone.");
  }

  return {
    result: "SAFE",
    reason:
      "Route, weather, battery reserve, diversion distance, and blocked-zone checks passed.",
  };
}

function unsafe(reason: string): AlternativeSafetyDecision {
  return { result: "UNSAFE", reason };
}

function isValidPoint(point: GeoPoint3D) {
  return (
    Number.isFinite(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    Number.isFinite(point.lng) &&
    point.lng >= -180 &&
    point.lng <= 180 &&
    Number.isFinite(point.altitude)
  );
}

function distanceMeters(
  first: Pick<GeoPoint3D, "lat" | "lng">,
  second: Pick<GeoPoint3D, "lat" | "lng">,
) {
  const latScale = 111_320;
  const meanLatitude = ((first.lat + second.lat) / 2) * (Math.PI / 180);
  const lngScale = latScale * Math.cos(meanLatitude);
  return Math.hypot(
    (first.lat - second.lat) * latScale,
    (first.lng - second.lng) * lngScale,
  );
}

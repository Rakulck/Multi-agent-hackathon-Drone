import type { GeoPoint3D } from "@/types/domain";
import type { Waypoint3D } from "@/types/map";

const EARTH_RADIUS_KM = 6371;

/** The rest of the app models points as `{ lat, lng, altitude }` (feet-agnostic, just a number). */
export function geoPointToWaypoint(point: GeoPoint3D): Waypoint3D {
  return { lat: point.lat, lng: point.lng, altitudeM: point.altitude };
}

export function waypointToGeoPoint(waypoint: Waypoint3D): GeoPoint3D {
  return { lat: waypoint.lat, lng: waypoint.lng, altitude: waypoint.altitudeM };
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function lerpWaypoint(a: Waypoint3D, b: Waypoint3D, t: number): Waypoint3D {
  return {
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
    altitudeM: lerp(a.altitudeM, b.altitudeM, t),
  };
}

export function haversineDistanceKm(a: Waypoint3D, b: Waypoint3D): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing (0-360, 0 = north) from point `a` toward point `b`. */
export function bearingDegrees(a: Waypoint3D, b: Waypoint3D): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export function routeLengthKm(waypoints: Waypoint3D[]): number {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    total += haversineDistanceKm(waypoints[i], waypoints[i + 1]);
  }
  return total;
}

export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export function mpsToMph(metersPerSecond: number): number {
  return metersPerSecond * 2.23694;
}

export function mphToMps(milesPerHour: number): number {
  return milesPerHour / 2.23694;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

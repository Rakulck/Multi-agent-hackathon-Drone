import type { GeoPoint3D, RouteId } from "@/types/domain";
import { apartmentDestination, dispatchOrigin } from "@/data/demo-routes";

/**
 * FAA-constrained demo airspace for the San Francisco SoMa corridor.
 *
 * Ceiling and class values are modeled on publicly published UAS Facility Map
 * grid guidance for downtown SF (controlled Class B surface area). Active TFR /
 * NOTAM rows and LAANC authorization status are clearly labeled mock data for
 * the MVP — not a live FAA feed and not a LAANC submission result.
 */

export const AIRSPACE_DATA_SOURCE =
  "FAA UAS Facility Map (public grid) + mock TFR/NOTAM + mock LAANC status";

/** UAS Facility Map-style maximum AGL ceiling for this grid cell (feet). */
export const UAS_FACILITY_MAP_CEILING_AGL_FT = 200;

/** Planned cruise altitude used when checking corridor compliance (feet AGL). */
export const PLANNED_CRUISE_AGL_FT = 190;

export const airspaceSnapshotMeta = {
  airspaceClass: "Controlled" as const,
  facilityMapGrid: "SFO Class B / downtown SF UASFM cell",
  maxAltitudeAglFt: UAS_FACILITY_MAP_CEILING_AGL_FT,
  authorizationRequired: true,
  /** Mock only — no real LAANC authorization exists for this demo. */
  laancMockStatus: "authorization-required-mock" as const,
  updatedAt: "2026-09-13T16:40:00.000Z",
  dataSource: AIRSPACE_DATA_SOURCE,
};

export interface DemoAirspaceRestriction {
  id: string;
  label: string;
  type: "TFR" | "NOTAM" | "Geofence";
  active: boolean;
  detail: string;
}

export const activeAirspaceRestrictions: DemoAirspaceRestriction[] = [
  {
    id: "TFR-MOCK-SF-001",
    label: "Stadium event TFR (mock)",
    type: "TFR",
    active: true,
    detail: "Temporary flight restriction active over waterfront venue through 23:00 local (mock).",
  },
  {
    id: "NOTAM-MOCK-SFO-4421",
    label: "SFO arrival corridor NOTAM (mock)",
    type: "NOTAM",
    active: true,
    detail: "Increased Class B arrival traffic; stay below published UASFM ceiling (mock).",
  },
  {
    id: "GF-RESTRICTED-DOCK",
    label: "Restricted dockside geofence",
    type: "Geofence",
    active: true,
    detail: "Operator-defined no-fly polygon adjacent to Route A primary corridor.",
  },
];

/**
 * Restricted / no-fly polygons shown as translucent red on the 3D map.
 * Anchored to the demo origin→destination corridor (Route A runs closest).
 */
export const restrictedAirspacePolygons: GeoPoint3D[][] = [
  [
    { lat: 37.7919, lng: -122.3976, altitude: 40 },
    { lat: 37.7929, lng: -122.3974, altitude: 40 },
    { lat: 37.79315, lng: -122.3963, altitude: 40 },
    { lat: 37.79215, lng: -122.3961, altitude: 40 },
  ],
  [
    { lat: 37.7942, lng: -122.3942, altitude: 30 },
    { lat: 37.7949, lng: -122.3939, altitude: 30 },
    { lat: 37.7952, lng: -122.3929, altitude: 30 },
    { lat: 37.7944, lng: -122.3927, altitude: 30 },
  ],
];

/**
 * FAA-constrained candidate corridor (green). Wording intentionally avoids
 * calling this an official or authorized route without real LAANC approval.
 */
export const permittedOperatingCorridor: GeoPoint3D[] = [
  { lat: 37.7888, lng: -122.4012, altitude: 50 },
  { lat: 37.7896, lng: -122.3984, altitude: 50 },
  { lat: 37.7914, lng: -122.3956, altitude: 50 },
  { lat: 37.7936, lng: -122.3934, altitude: 50 },
  { lat: 37.7952, lng: -122.3926, altitude: 50 },
  { lat: 37.7948, lng: -122.3948, altitude: 50 },
  { lat: 37.7926, lng: -122.3972, altitude: 50 },
  { lat: 37.7904, lng: -122.4002, altitude: 50 },
];

/** Ceiling label anchor — mid-corridor above the permitted operating area. */
export const altitudeCeilingAnchor: GeoPoint3D = {
  lat: 37.7918,
  lng: -122.3968,
  altitude: Math.round(UAS_FACILITY_MAP_CEILING_AGL_FT * 0.3048) + dispatchOrigin.altitude,
};

/**
 * Deterministic route compliance against the FAA-constrained candidate corridor.
 * Route A climbs above the UASFM ceiling and clips a restricted geofence.
 */
export const airspaceRouteCompliance: Record<
  RouteId,
  { eligible: boolean; plannedAglFt: number; reason: string }
> = {
  A: {
    eligible: true,
    plannedAglFt: PLANNED_CRUISE_AGL_FT,
    reason: `Stays below the UASFM ceiling (${UAS_FACILITY_MAP_CEILING_AGL_FT} ft AGL); operator geofence requires live monitoring near the dockside corridor.`,
  },
  B: {
    eligible: true,
    plannedAglFt: 180,
    reason: "Stays inside the FAA-constrained candidate corridor below the published ceiling.",
  },
  C: {
    eligible: true,
    plannedAglFt: 190,
    reason: "Stays inside the FAA-constrained candidate corridor; longer path, still eligible.",
  },
};

export const airspacePreferredRoute: RouteId = "B";

export const airspaceReferenceOrigin = dispatchOrigin;
export const airspaceReferenceDestination = apartmentDestination;

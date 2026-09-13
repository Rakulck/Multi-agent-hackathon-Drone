import type { RouteId, RouteStatus } from "@/types/domain";

/** A single 3D point used throughout the map engine. Altitude is always meters here. */
export interface Waypoint3D {
  lat: number;
  lng: number;
  altitudeM: number;
}

export interface DemoRouteDefinition {
  id: RouteId;
  name: string;
  color: string;
  waypoints: Waypoint3D[];
  distanceKm: number;
  estimatedMinutes: number;
}

export interface DropOffZoneDefinition {
  id: string;
  label: string;
  position: Waypoint3D;
  role: "primary" | "alternate";
}

export interface ObstacleZoneDefinition {
  id: string;
  type: string;
  position: Waypoint3D;
  minAltitudeM: number;
  maxAltitudeM: number;
  radiusM: number;
  severity: "warning" | "blocked";
  confidence: number;
  active: boolean;
  sourceDrone?: string;
  memoryId?: string;
  geofence?: Waypoint3D[];
}

export type CameraPresetId = "OVERVIEW" | "FOLLOW_DRONE" | "OBSTACLE" | "DESTINATION";

export interface CameraPresetDefinition {
  id: CameraPresetId;
  center: Waypoint3D;
  heading: number;
  tilt: number;
  range: number;
}

export interface CameraState {
  lat: number;
  lng: number;
  altitudeM: number;
  heading: number;
  tilt: number;
  range: number;
}

export type MapDroneId = "atlas-heavylift" | "cargoswift-s2";

export interface RouteAnimationCallbacks {
  onPositionChange?: (position: Waypoint3D, headingDeg: number) => void;
  onSpeedChange?: (speedMph: number) => void;
  onAltitudeChange?: (altitudeFt: number) => void;
  onWaypointChange?: (index: number, total: number) => void;
  onRouteComplete?: (routeId: RouteId) => void;
  onAnimationError?: (error: Error) => void;
}

export interface DroneSimulationTelemetry {
  position: Waypoint3D;
  headingDeg: number;
  speedMph: number;
  altitudeFt: number;
  routeId: RouteId | null;
  waypointIndex: number;
  waypointTotal: number;
  isPaused: boolean;
  isRunning: boolean;
}

export type MapRouteStatus = RouteStatus | "inactive";

export interface DroneMapHandle {
  showOverview: () => void;
  focusOnObstacle: () => void;
  focusOnDestination: () => void;
  setFollowEnabled: (enabled: boolean) => void;
  isFollowEnabled: () => boolean;
}

import { bearingDegrees, haversineDistanceKm, lerpWaypoint, metersToFeet, mphToMps } from "@/lib/map/geo-utils";
import type { RouteId } from "@/types/domain";
import type { RouteAnimationCallbacks, Waypoint3D } from "@/types/map";

const DEFAULT_CRUISE_SPEED_MPH = 28;
const DEFAULT_SPEED_TRANSITION_MS = 800;
const DEFAULT_ALTITUDE_TRANSITION_MS = 1600;
/** Clamp huge deltas (e.g. after a background tab throttles rAF) so the drone never "jumps". */
const MAX_FRAME_DELTA_MS = 120;

/**
 * Deterministic, time-based waypoint animation engine.
 *
 * This class owns no React state and renders nothing itself — it just
 * advances a simulated drone through an array of waypoints using elapsed
 * wall-clock time, and reports progress through callbacks. `use-drone-simulation`
 * wraps this in a React-friendly hook; map components subscribe to the
 * callbacks to mutate map elements directly (no per-frame React re-render).
 */
export class RouteAnimationEngine {
  private routes: Record<RouteId, Waypoint3D[]>;
  private callbacks: RouteAnimationCallbacks;

  private rafId: number | null = null;
  private lastTimestamp: number | null = null;

  private currentRouteId: RouteId | null = null;
  private waypoints: Waypoint3D[] = [];
  private segmentIndex = 0;
  private segmentProgress = 0;

  private position: Waypoint3D = { lat: 0, lng: 0, altitudeM: 0 };
  private heading = 0;

  private targetSpeedMph = DEFAULT_CRUISE_SPEED_MPH;
  private currentSpeedMph = 0;
  private targetAltitudeM: number | null = null;

  private paused = true;
  private running = false;

  constructor(routes: Record<RouteId, Waypoint3D[]>, callbacks: RouteAnimationCallbacks = {}) {
    this.routes = routes;
    this.callbacks = callbacks;
  }

  getPosition(): Waypoint3D {
    return this.position;
  }

  getHeading(): number {
    return this.heading;
  }

  getSpeedMph(): number {
    return this.currentSpeedMph;
  }

  getRouteId(): RouteId | null {
    return this.currentRouteId;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Begin (or restart) flight along `routeId` from its first waypoint. */
  startRoute(routeId: RouteId): void {
    const waypoints = this.routes[routeId];

    if (!waypoints || waypoints.length < 2) {
      this.callbacks.onAnimationError?.(new Error(`Unknown or invalid route: ${routeId}`));
      return;
    }

    this.stopLoop();
    this.currentRouteId = routeId;
    this.waypoints = waypoints;
    this.segmentIndex = 0;
    this.segmentProgress = 0;
    this.position = waypoints[0];
    this.heading = bearingDegrees(waypoints[0], waypoints[1]);
    this.currentSpeedMph = 0;
    this.targetSpeedMph = DEFAULT_CRUISE_SPEED_MPH;
    this.targetAltitudeM = null;
    this.paused = false;
    this.running = true;
    this.lastTimestamp = null;
    this.emitPosition();
    this.startLoop();
  }

  pauseFlight(): void {
    this.paused = true;
  }

  resumeFlight(): void {
    if (!this.running) {
      return;
    }
    this.paused = false;
    this.lastTimestamp = null;
    this.startLoop();
  }

  changeSpeed(speedMph: number): void {
    this.targetSpeedMph = Math.max(0, speedMph);
  }

  changeAltitude(altitudeFeet: number): void {
    this.targetAltitudeM = altitudeFeet / 3.28084;
  }

  /**
   * Reroute mid-flight: build a short connector from the drone's current
   * position to the nearest suitable waypoint on the new route, then
   * continue along that route. The drone never teleports.
   */
  transitionToRoute(routeId: RouteId): void {
    const nextWaypoints = this.routes[routeId];

    if (!nextWaypoints || nextWaypoints.length < 2) {
      this.callbacks.onAnimationError?.(new Error(`Unknown or invalid route: ${routeId}`));
      return;
    }

    const nearestIndex = this.findNearestWaypointIndex(nextWaypoints, this.position);
    const connector = [this.position, ...nextWaypoints.slice(nearestIndex)];

    this.currentRouteId = routeId;
    this.waypoints = connector.length >= 2 ? connector : nextWaypoints;
    this.segmentIndex = 0;
    this.segmentProgress = 0;
  }

  /** Alias kept for callers that think in terms of "change route" rather than "transition". */
  changeRoute(routeId: RouteId): void {
    this.transitionToRoute(routeId);
  }

  /** Replace the final waypoint (e.g. an alternate drop-off zone) without recreating the route. */
  updateDestination(position: Waypoint3D): void {
    if (this.waypoints.length === 0) {
      return;
    }
    const updated = [...this.waypoints];
    updated[updated.length - 1] = position;
    this.waypoints = updated;
  }

  resetFlight(): void {
    this.stopLoop();
    this.currentRouteId = null;
    this.waypoints = [];
    this.segmentIndex = 0;
    this.segmentProgress = 0;
    this.position = { lat: 0, lng: 0, altitudeM: 0 };
    this.heading = 0;
    this.currentSpeedMph = 0;
    this.targetSpeedMph = DEFAULT_CRUISE_SPEED_MPH;
    this.targetAltitudeM = null;
    this.paused = true;
    this.running = false;
  }

  /** Cancels any pending animation frame. Safe to call multiple times (e.g. on unmount). */
  cancel(): void {
    this.stopLoop();
    this.running = false;
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = null;
  }

  private startLoop(): void {
    if (this.rafId !== null) {
      // Never allow two loops to run concurrently.
      return;
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  private findNearestWaypointIndex(waypoints: Waypoint3D[], from: Waypoint3D): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    waypoints.forEach((point, index) => {
      const distance = haversineDistanceKm(from, point);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  private loop = (timestamp: number): void => {
    this.rafId = null;

    if (this.paused || !this.running) {
      return;
    }

    const last = this.lastTimestamp ?? timestamp;
    const dtMs = Math.min(timestamp - last, MAX_FRAME_DELTA_MS);
    this.lastTimestamp = timestamp;

    try {
      this.step(Math.max(0, dtMs));
    } catch (error) {
      this.callbacks.onAnimationError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    if (this.running && !this.paused) {
      this.startLoop();
    }
  };

  private step(dtMs: number): void {
    const speedDeltaMax = (Math.abs(this.targetSpeedMph - this.currentSpeedMph) * dtMs) / DEFAULT_SPEED_TRANSITION_MS;

    if (this.currentSpeedMph < this.targetSpeedMph) {
      this.currentSpeedMph = Math.min(this.targetSpeedMph, this.currentSpeedMph + speedDeltaMax);
    } else if (this.currentSpeedMph > this.targetSpeedMph) {
      this.currentSpeedMph = Math.max(this.targetSpeedMph, this.currentSpeedMph - speedDeltaMax);
    }
    this.callbacks.onSpeedChange?.(this.currentSpeedMph);

    if (this.targetAltitudeM !== null) {
      const altStep = (Math.abs(this.targetAltitudeM - this.position.altitudeM) * dtMs) / DEFAULT_ALTITUDE_TRANSITION_MS;
      if (this.position.altitudeM < this.targetAltitudeM) {
        this.position = { ...this.position, altitudeM: Math.min(this.targetAltitudeM, this.position.altitudeM + altStep) };
      } else if (this.position.altitudeM > this.targetAltitudeM) {
        this.position = { ...this.position, altitudeM: Math.max(this.targetAltitudeM, this.position.altitudeM - altStep) };
      }
      this.callbacks.onAltitudeChange?.(metersToFeet(this.position.altitudeM));
    }

    if (this.waypoints.length < 2) {
      return;
    }

    const distanceKm = (mphToMps(this.currentSpeedMph) * (dtMs / 1000)) / 1000;

    if (distanceKm > 0) {
      this.advanceAlongRoute(distanceKm);
    }

    this.emitPosition();
  }

  private advanceAlongRoute(distanceKm: number): void {
    let remaining = distanceKm;

    while (remaining > 0 && this.segmentIndex < this.waypoints.length - 1) {
      const start = this.waypoints[this.segmentIndex];
      const end = this.waypoints[this.segmentIndex + 1];
      const segmentLengthKm = haversineDistanceKm(start, end) || 0.0001;
      const remainingInSegmentKm = segmentLengthKm * (1 - this.segmentProgress);

      if (remaining < remainingInSegmentKm) {
        this.segmentProgress += remaining / segmentLengthKm;
        remaining = 0;
      } else {
        remaining -= remainingInSegmentKm;
        this.segmentIndex += 1;
        this.segmentProgress = 0;
        this.callbacks.onWaypointChange?.(this.segmentIndex, this.waypoints.length);

        if (this.segmentIndex >= this.waypoints.length - 1) {
          this.position = this.waypoints[this.waypoints.length - 1];
          this.currentSpeedMph = 0;
          this.paused = true;
          const completedRouteId = this.currentRouteId;
          if (completedRouteId) {
            this.callbacks.onRouteComplete?.(completedRouteId);
          }
          return;
        }
      }
    }

    const start = this.waypoints[this.segmentIndex];
    const end = this.waypoints[Math.min(this.segmentIndex + 1, this.waypoints.length - 1)];
    this.position = lerpWaypoint(start, end, this.segmentProgress);
    this.heading = bearingDegrees(start, end);
  }

  private emitPosition(): void {
    this.callbacks.onPositionChange?.(this.position, this.heading);
  }
}

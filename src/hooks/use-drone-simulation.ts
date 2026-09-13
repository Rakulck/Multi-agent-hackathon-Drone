"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { metersToFeet } from "@/lib/map/geo-utils";
import { RouteAnimationEngine } from "@/lib/map/route-animation";
import type { RouteId } from "@/types/domain";
import type { DroneSimulationTelemetry, Waypoint3D } from "@/types/map";

interface UseDroneSimulationOptions {
  /** Throttle React state updates during animation (ms). The engine itself always runs at full rAF rate. */
  throttleMs?: number;
  routes: Record<RouteId, Waypoint3D[]>;
}

const idleTelemetry: DroneSimulationTelemetry = {
  position: { lat: 0, lng: 0, altitudeM: 0 },
  headingDeg: 0,
  speedMph: 0,
  altitudeFt: 0,
  routeId: null,
  waypointIndex: 0,
  waypointTotal: 0,
  isPaused: true,
  isRunning: false,
};

/**
 * React wrapper around `RouteAnimationEngine`. The engine instance is created
 * once (survives re-renders) and telemetry is throttled before it reaches
 * React state, so high-frequency animation never forces a full dashboard
 * re-render on every frame.
 */
export function useDroneSimulation({ routes, throttleMs = 80 }: UseDroneSimulationOptions) {
  const [telemetry, setTelemetry] = useState<DroneSimulationTelemetry>(idleTelemetry);
  const lastEmitRef = useRef(0);
  const engineRef = useRef<RouteAnimationEngine | null>(null);

  // The engine is created (and torn down) inside an effect — never during
  // render — so it survives re-renders but is still properly cleaned up.
  useEffect(() => {
    const engine = new RouteAnimationEngine(routes, {
      onPositionChange: (position, headingDeg) => {
        const now = performance.now();
        if (now - lastEmitRef.current < throttleMs) {
          return;
        }
        lastEmitRef.current = now;
        setTelemetry((current) => ({
          ...current,
          position,
          headingDeg,
          altitudeFt: metersToFeet(position.altitudeM),
        }));
      },
      onSpeedChange: (speedMph) => {
        setTelemetry((current) => ({ ...current, speedMph }));
      },
      onWaypointChange: (waypointIndex, waypointTotal) => {
        setTelemetry((current) => ({ ...current, waypointIndex, waypointTotal }));
      },
      onRouteComplete: () => {
        setTelemetry((current) => ({ ...current, isPaused: true, isRunning: false }));
      },
      onAnimationError: (error) => {
        // Intentionally no raw stack traces or payloads surfaced to the UI.
        console.error("[drone-simulation]", error.message);
      },
    });

    engineRef.current = engine;
    let resumeAfterVisibility = false;
    const handleVisibilityChange = () => {
      if (document.hidden && engine.isRunning() && !engine.isPaused()) {
        resumeAfterVisibility = true;
        engine.pauseFlight();
      } else if (!document.hidden && resumeAfterVisibility) {
        resumeAfterVisibility = false;
        engine.resumeFlight();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      engine.cancel();
      engineRef.current = null;
    };
  }, [routes, throttleMs]);

  const startRoute = useCallback((routeId: RouteId) => {
    engineRef.current?.startRoute(routeId);
    setTelemetry((current) => ({ ...current, routeId, isPaused: false, isRunning: true }));
  }, []);

  const pauseFlight = useCallback(() => {
    engineRef.current?.pauseFlight();
    setTelemetry((current) => ({ ...current, isPaused: true }));
  }, []);

  const resumeFlight = useCallback(() => {
    engineRef.current?.resumeFlight();
    setTelemetry((current) => ({ ...current, isPaused: false }));
  }, []);

  const changeRoute = useCallback((routeId: RouteId) => {
    engineRef.current?.transitionToRoute(routeId);
    setTelemetry((current) => ({ ...current, routeId }));
  }, []);

  const changeSpeed = useCallback((speedMph: number) => {
    engineRef.current?.changeSpeed(speedMph);
  }, []);

  const changeAltitude = useCallback((altitudeFeet: number) => {
    engineRef.current?.changeAltitude(altitudeFeet);
  }, []);

  const updateDestination = useCallback((position: Waypoint3D) => {
    engineRef.current?.updateDestination(position);
  }, []);

  const resetFlight = useCallback(() => {
    engineRef.current?.resetFlight();
    setTelemetry(idleTelemetry);
  }, []);

  return useMemo(
    () => ({
      changeAltitude,
      changeRoute,
      changeSpeed,
      pauseFlight,
      resetFlight,
      resumeFlight,
      startRoute,
      telemetry,
      updateDestination,
    }),
    [changeAltitude, changeRoute, changeSpeed, pauseFlight, resetFlight, resumeFlight, startRoute, telemetry, updateDestination],
  );
}

export type UseDroneSimulationResult = ReturnType<typeof useDroneSimulation>;

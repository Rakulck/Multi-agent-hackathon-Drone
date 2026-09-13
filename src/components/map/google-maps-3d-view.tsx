"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MapCalibrationPanel } from "@/components/map/map-calibration-panel";
import { MapFallback } from "@/components/map/map-fallback";
import { MapLoadingState } from "@/components/map/map-loading-state";
import { MapSimulatedEnvironmentLabel, MapStatusOverlay } from "@/components/map/map-status-overlay";
import { MapTestControls } from "@/components/map/map-test-controls";
import { altitudeObstacle as altitudeObstacleDef, demoRouteWaypoints } from "@/data/demo-scene";
import { useDroneSimulation } from "@/hooks/use-drone-simulation";
import { createCameraController, type CameraController, type Map3DLike } from "@/lib/map/camera-controller";
import { bearingDegrees, metersToFeet } from "@/lib/map/geo-utils";
import { importGoogleMapsLibrary } from "@/lib/map/load-google-maps";
import { buildCameraPresetsForScene } from "@/lib/map/route-warp";
import type { DropOffZone, GeoPoint3D, MissionMapScene, RouteId, RouteLegendItem, RouteStatus } from "@/types/domain";
import type { CameraState, DroneMapHandle } from "@/types/map";

type MapEl = HTMLElement & Record<string, unknown>;

const routeColors: Record<RouteStatus | "inactive", string> = {
  candidate: "#171717",
  selected: "#22c55e",
  warning: "#f59e0b",
  blocked: "#ef4444",
  inactive: "#9ca3af",
};

interface ElementRegistry {
  map: MapEl | null;
  routes: Partial<Record<RouteId, MapEl>>;
  originMarker: MapEl | null;
  destinationMarker: MapEl | null;
  dropOffMarker: MapEl | null;
  altDropOffAMarker: MapEl | null;
  altDropOffBMarker: MapEl | null;
  droneMarker: MapEl | null;
  craneMarker: MapEl | null;
  craneGeofence: MapEl | null;
  altitudeObstacleMarker: MapEl | null;
}

function emptyRegistry(): ElementRegistry {
  return {
    altDropOffAMarker: null,
    altDropOffBMarker: null,
    altitudeObstacleMarker: null,
    craneGeofence: null,
    craneMarker: null,
    destinationMarker: null,
    droneMarker: null,
    dropOffMarker: null,
    map: null,
    originMarker: null,
    routes: {},
  };
}

interface GoogleMaps3DViewProps {
  routeStatuses: Record<RouteId, RouteStatus>;
  selectedRoute: RouteId | null;
  dronePosition: GeoPoint3D;
  hazardVisible: boolean;
  dropOffZone: DropOffZone;
  routes: RouteLegendItem[];
  statusLabel: string;
  reroutingBanner?: string | null;
  selectedDrone?: string;
  scene: MissionMapScene;
}

const routeColorClasses: Record<RouteLegendItem["status"], string> = {
  candidate: "bg-neutral-900",
  selected: "bg-emerald-500",
  warning: "bg-amber-500",
  blocked: "bg-red-500",
};

/**
 * Reusable 3D mission-environment component. Creates the Google Maps 3D
 * scene exactly once and keeps a registry of the appended elements so later
 * prop changes (route status, drone position, hazard visibility, drop-off)
 * mutate existing elements instead of recreating the whole map.
 *
 * Exposes `showOverview` / `focusOnObstacle` / `focusOnDestination` /
 * `setFollowEnabled` via ref so the mission state machine can drive the
 * camera later without owning any map internals directly.
 */
export const GoogleMaps3DView = forwardRef<DroneMapHandle, GoogleMaps3DViewProps>(function GoogleMaps3DView(
  { routeStatuses, selectedRoute, dronePosition, hazardVisible, dropOffZone, routes, statusLabel, reroutingBanner, selectedDrone, scene },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<ElementRegistry>(emptyRegistry());
  const cameraControllerRef = useRef<CameraController | null>(null);
  const prevPositionRef = useRef<GeoPoint3D>(dronePosition);
  const cameraPresets = useMemo(() => buildCameraPresetsForScene(scene), [scene]);
  const sceneKey = `${scene.origin.lat},${scene.origin.lng}-${scene.destination.lat},${scene.destination.lng}`;

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error" | "missing-key">("idle");
  const [retryToken, setRetryToken] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [followEnabled, setFollowEnabled] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);

  // Debug-only local state — never touches the real mission state machine.
  const [debugDroneLabel, setDebugDroneLabel] = useState("Atlas HeavyLift");
  const [debugRouteStatuses, setDebugRouteStatuses] = useState<Record<RouteId, RouteStatus>>(routeStatuses);
  const [debugHazardVisible, setDebugHazardVisible] = useState(false);
  const [debugDestination, setDebugDestination] = useState<"primary" | "altA" | "altB">("primary");

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const debugSim = useDroneSimulation({ routes: demoRouteWaypoints });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get("debugMap") === "1");
  }, []);

  // --- Create the map + static scene exactly once (per API key / retry). ---
  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (!containerRef.current) {
        return;
      }

      if (!mapsKey) {
        setLoadState("missing-key");
        return;
      }

      setLoadState("loading");

      try {
        const library = await importGoogleMapsLibrary(mapsKey, "maps3d");
        if (cancelled || !containerRef.current) {
          return;
        }

        const Map3DElement = library.Map3DElement as new (options: Record<string, unknown>) => MapEl;
        const Polyline3DElement = library.Polyline3DElement as new (options: Record<string, unknown>) => MapEl;
        const Polygon3DElement = library.Polygon3DElement as new (options: Record<string, unknown>) => MapEl;
        const Marker3DElement = library.Marker3DElement as new (options: Record<string, unknown>) => MapEl;
        const altitudeMode = (library.AltitudeMode as Record<string, string> | undefined)?.ABSOLUTE ?? "ABSOLUTE";

        const map = new Map3DElement({
          center: { ...scene.origin, altitude: 260 },
          heading: cameraPresets.OVERVIEW.heading,
          range: cameraPresets.OVERVIEW.range,
          tilt: cameraPresets.OVERVIEW.tilt,
        });
        map.style.display = "block";
        map.style.height = "100%";
        map.style.minHeight = "100%";
        map.style.width = "100%";

        let steadyStateSeen = false;
        map.addEventListener("gmp-steadystate", () => {
          steadyStateSeen = true;
          if (!cancelled) {
            setLoadState("ready");
          }
        });
        map.addEventListener("gmp-error", () => {
          if (!cancelled) {
            setLoadState("error");
          }
        });

        const routeElements: Partial<Record<RouteId, MapEl>> = {};
        scene.routes.forEach((route) => {
          const el = new Polyline3DElement({
            altitudeMode,
            coordinates: route.waypoints,
            drawsOccludedSegments: true,
            strokeColor: routeColors[routeStatuses[route.id]],
            strokeWidth: selectedRoute === route.id ? 8 : 5,
          });
          map.append(el);
          routeElements[route.id] = el;
        });

        const originMarker = new Marker3DElement({ altitudeMode, label: scene.originLabel, position: scene.origin });
        const destinationMarker = new Marker3DElement({
          altitudeMode,
          label: scene.destinationLabel,
          position: scene.destination,
        });
        map.append(originMarker);
        map.append(destinationMarker);

        const dropOffMarker = new Marker3DElement({ altitudeMode, label: dropOffZone.label, position: dropOffZone.point });
        map.append(dropOffMarker);

        const altDropOffAMarker = new Marker3DElement({
          altitudeMode,
          label: "Alternate Zone A",
          position: scene.alternateDropOffA,
        });
        altDropOffAMarker.style.display = "none";
        map.append(altDropOffAMarker);

        const altDropOffBMarker = new Marker3DElement({
          altitudeMode,
          label: "Alternate Zone B",
          position: scene.alternateDropOffB,
        });
        altDropOffBMarker.style.display = "none";
        map.append(altDropOffBMarker);

        const craneGeofence = new Polygon3DElement({
          altitudeMode,
          outerCoordinates: scene.hazard.polygon,
          extruded: true,
          fillColor: "rgba(239,68,68,0.28)",
          strokeColor: "#ef4444",
          strokeWidth: 3,
        });
        craneGeofence.style.display = hazardVisible ? "block" : "none";
        map.append(craneGeofence);

        const craneMarker = new Marker3DElement({ altitudeMode, label: "Construction Crane", position: scene.hazard.center });
        craneMarker.style.display = hazardVisible ? "block" : "none";
        map.append(craneMarker);

        const altitudeObstacleMarker = new Marker3DElement({
          altitudeMode,
          label: `Altitude obstruction · ${Math.round(metersToFeet(altitudeObstacleDef.minAltitudeM))}-${Math.round(
            metersToFeet(altitudeObstacleDef.maxAltitudeM),
          )} ft`,
          position: scene.secondObstacle,
        });
        altitudeObstacleMarker.style.display = "none";
        map.append(altitudeObstacleMarker);

        const droneMarker = new Marker3DElement({
          altitudeMode,
          label: `${selectedDrone ?? "Atlas HeavyLift"} · Route ${selectedRoute ?? "-"} · ${Math.round(metersToFeet(dronePosition.altitude))} ft`,
          position: dronePosition,
        });
        map.append(droneMarker);

        registryRef.current = {
          altDropOffAMarker,
          altDropOffBMarker,
          altitudeObstacleMarker,
          craneGeofence,
          craneMarker,
          destinationMarker,
          droneMarker,
          dropOffMarker,
          map,
          originMarker,
          routes: routeElements,
        };

        containerRef.current.replaceChildren(map);
        cameraControllerRef.current = createCameraController(() => registryRef.current.map as unknown as Map3DLike, cameraPresets);

        // The alpha 3D API's steady-state event isn't guaranteed in every
        // build; fall back to marking the scene ready shortly after append.
        window.setTimeout(() => {
          if (!cancelled && !steadyStateSeen) {
            setLoadState("ready");
          }
        }, 2200);
      } catch (error) {
        console.error("[GoogleMaps3DView]", error instanceof Error ? error.message : error);
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    void build();

    return () => {
      cancelled = true;
    };
    // Runs when the key or a manual retry changes, and also rebuilds when the
    // mission's map scene changes (new geocoded pickup/drop addresses) since
    // that moves the origin/destination/route/hazard geometry itself. Route
    // status, drone position and hazard visibility are mutated afterward via
    // the effects below instead of triggering a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsKey, retryToken, sceneKey]);

  // --- Route color/width updates (no recreation). ---
  useEffect(() => {
    const statuses = debugMode ? debugRouteStatuses : routeStatuses;
    const active = debugMode ? debugSim.telemetry.routeId : selectedRoute;
    const { routes } = registryRef.current;

    (Object.keys(statuses) as RouteId[]).forEach((id) => {
      const el = routes[id];
      if (!el) return;
      el.strokeColor = routeColors[statuses[id]];
      el.strokeWidth = active === id ? 8 : 5;
    });
  }, [routeStatuses, selectedRoute, debugMode, debugRouteStatuses, debugSim.telemetry.routeId, loadState]);

  // --- Drone position + heading + optional camera follow (normal mode). ---
  useEffect(() => {
    if (debugMode) return;
    const { droneMarker } = registryRef.current;
    if (!droneMarker) return;

    const heading = bearingDegrees(
      { altitudeM: prevPositionRef.current.altitude, lat: prevPositionRef.current.lat, lng: prevPositionRef.current.lng },
      { altitudeM: dronePosition.altitude, lat: dronePosition.lat, lng: dronePosition.lng },
    );

    droneMarker.position = dronePosition;
    droneMarker.label = `${selectedDrone ?? "Atlas HeavyLift"} · Route ${selectedRoute ?? "-"} · ${Math.round(
      metersToFeet(dronePosition.altitude),
    )} ft`;
    prevPositionRef.current = dronePosition;

    if (followEnabled) {
      cameraControllerRef.current?.focusOnDrone({ altitudeM: dronePosition.altitude, lat: dronePosition.lat, lng: dronePosition.lng }, heading);
    }
  }, [dronePosition, selectedRoute, selectedDrone, followEnabled, debugMode, loadState]);

  // --- Debug engine drives the drone marker instead, when active. ---
  useEffect(() => {
    if (!debugMode) return;
    const { droneMarker } = registryRef.current;
    if (!droneMarker) return;

    const position = debugSim.telemetry.position;
    droneMarker.position = { altitude: position.altitudeM, lat: position.lat, lng: position.lng };
    droneMarker.label = `${debugDroneLabel} · Route ${debugSim.telemetry.routeId ?? "-"} · ${Math.round(debugSim.telemetry.altitudeFt)} ft`;

    if (followEnabled) {
      cameraControllerRef.current?.focusOnDrone(position, debugSim.telemetry.headingDeg);
    }
  }, [debugMode, debugSim.telemetry, followEnabled, debugDroneLabel]);

  // --- Hazard (crane) visibility. ---
  useEffect(() => {
    const visible = debugMode ? debugHazardVisible : hazardVisible;
    const { craneMarker, craneGeofence } = registryRef.current;
    if (craneMarker) craneMarker.style.display = visible ? "block" : "none";
    if (craneGeofence) craneGeofence.style.display = visible ? "block" : "none";
  }, [hazardVisible, debugMode, debugHazardVisible, loadState]);

  // --- Drop-off marker updates (position/label only, no recreation). ---
  useEffect(() => {
    const { dropOffMarker } = registryRef.current;
    if (!dropOffMarker) return;
    dropOffMarker.position = dropOffZone.point;
    dropOffMarker.label = dropOffZone.label;
  }, [dropOffZone, loadState]);

  // --- Debug destination cycling (primary / alternate A / alternate B). ---
  useEffect(() => {
    if (!debugMode) return;
    const { altDropOffAMarker, altDropOffBMarker, destinationMarker } = registryRef.current;
    if (!altDropOffAMarker || !altDropOffBMarker || !destinationMarker) return;

    destinationMarker.style.opacity = debugDestination === "primary" ? "1" : "0.35";
    altDropOffAMarker.style.display = debugDestination === "altA" ? "block" : "none";
    altDropOffBMarker.style.display = debugDestination === "altB" ? "block" : "none";
  }, [debugDestination, debugMode, loadState]);

  // --- Calibration polling (debug only). ---
  useEffect(() => {
    if (!debugMode) return;
    const interval = window.setInterval(() => {
      const map = registryRef.current.map;
      if (!map) return;
      const center = map.center as { altitude?: number; lat?: number; lng?: number } | undefined;
      setCameraState({
        altitudeM: center?.altitude ?? 0,
        heading: Number(map.heading ?? 0),
        lat: center?.lat ?? 0,
        lng: center?.lng ?? 0,
        range: Number(map.range ?? 0),
        tilt: Number(map.tilt ?? 0),
      });
    }, 300);
    return () => window.clearInterval(interval);
  }, [debugMode]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focusOnDestination: () => cameraControllerRef.current?.focusOnDestination(),
      focusOnObstacle: () => cameraControllerRef.current?.focusOnObstacle(),
      isFollowEnabled: () => followEnabled,
      setFollowEnabled: (enabled: boolean) => {
        setFollowEnabled(enabled);
        cameraControllerRef.current?.setFollowEnabled(enabled);
      },
      showOverview: () => cameraControllerRef.current?.showMissionOverview(),
    }),
    [followEnabled],
  );

  const handleRetry = useCallback(() => {
    setLoadState("idle");
    setRetryToken((token) => token + 1);
  }, []);

  const handleChangeAltitude = useCallback(() => {
    const next = debugSim.telemetry.altitudeFt >= 500 ? 150 : debugSim.telemetry.altitudeFt + 50;
    debugSim.changeAltitude(next);
  }, [debugSim]);

  const handleChangeDestination = useCallback(() => {
    setDebugDestination((current) => (current === "primary" ? "altA" : current === "altA" ? "altB" : "primary"));
  }, []);

  const handleResetScene = useCallback(() => {
    debugSim.resetFlight();
    setDebugRouteStatuses(routeStatuses);
    setDebugHazardVisible(false);
    setDebugDestination("primary");
    setDebugDroneLabel("Atlas HeavyLift");
    cameraControllerRef.current?.showMissionOverview();
  }, [debugSim, routeStatuses]);

  const displayedFlightMode = debugMode ? (debugSim.telemetry.isPaused ? "PAUSED" : "SIMULATING") : statusLabel;
  const displayedDroneName = debugMode ? debugDroneLabel : selectedDrone ?? "Atlas HeavyLift";
  const displayedRouteId = debugMode ? debugSim.telemetry.routeId : selectedRoute;

  if (loadState === "missing-key" || loadState === "error") {
    return (
      <MapFallback
        dronePosition={dronePosition}
        dropOffZone={dropOffZone}
        hazardVisible={hazardVisible}
        onRetry={handleRetry}
        reason={loadState === "missing-key" ? "Maps key missing — showing deterministic route diagram." : "3D map failed to load. Showing route diagram."}
        routeStatuses={routeStatuses}
        scene={scene}
        selectedRoute={selectedRoute}
      />
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div ref={containerRef} className="h-full min-h-0" />
      {loadState !== "ready" ? <MapLoadingState /> : null}

      <div className="pointer-events-none absolute left-4 top-4 max-w-[520px] rounded-[22px] border border-neutral-200 bg-white/90 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-500">Route Legend</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {routes.map((route) => (
            <div key={route.name} className="min-w-[126px] rounded-2xl bg-white/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", routeColorClasses[route.status])} />
                <span className="text-sm font-semibold text-black">{route.name}</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{route.status}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="pointer-events-none flex flex-col items-end gap-2">
          <span className="rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
            {displayedFlightMode}
          </span>
          {displayedRouteId ? (
            <span className="rounded-full border border-neutral-200 bg-black/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
              Current Route {displayedRouteId}
            </span>
          ) : null}
        </div>
        <div className="pointer-events-auto flex gap-1.5 rounded-full border border-neutral-200 bg-white/90 p-1 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setFollowEnabled(false);
              cameraControllerRef.current?.setFollowEnabled(false);
              cameraControllerRef.current?.showMissionOverview();
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition",
              !followEnabled ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-black",
            )}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => {
              setFollowEnabled(true);
              cameraControllerRef.current?.setFollowEnabled(true);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition",
              followEnabled ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-black",
            )}
          >
            Follow Drone
          </button>
        </div>
      </div>

      {reroutingBanner ? (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50/95 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
          {reroutingBanner}
        </div>
      ) : null}

      <MapStatusOverlay
        dropOffLabel={dropOffZone.label}
        flightMode={displayedFlightMode}
        droneName={displayedDroneName}
        followEnabled={followEnabled}
        routeId={displayedRouteId}
      />
      <MapSimulatedEnvironmentLabel />

      {debugMode ? (
        <>
          <MapCalibrationPanel cameraState={cameraState} />
          <MapTestControls
            onBlockRouteA={() => setDebugRouteStatuses((current) => ({ ...current, A: "blocked" }))}
            onChangeAltitude={handleChangeAltitude}
            onChangeDestination={handleChangeDestination}
            onPause={debugSim.pauseFlight}
            onReset={handleResetScene}
            onResume={debugSim.resumeFlight}
            onSelectRouteC={() => {
              setDebugRouteStatuses((current) => ({ ...current, C: "selected" }));
              debugSim.changeRoute("C");
            }}
            onSpawnAtlas={() => setDebugDroneLabel("Atlas HeavyLift")}
            onSpawnCargoSwift={() => setDebugDroneLabel("CargoSwift S2")}
            onStartRoute={(routeId) => debugSim.startRoute(routeId)}
            onToggleCrane={() => setDebugHazardVisible((current) => !current)}
          />
        </>
      ) : null}
    </div>
  );
});

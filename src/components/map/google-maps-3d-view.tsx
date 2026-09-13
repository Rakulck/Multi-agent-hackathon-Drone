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
import {
  buildReroutePath,
  circleAroundPoint,
  deriveMissionVisualState,
  interpolateBearing,
  prefersReducedMotion,
  sampleRouteByDistance,
  splitRouteAtProgress,
} from "@/lib/map/mission-animation";
import { buildCameraPresetsForScene } from "@/lib/map/route-warp";
import type { DropOffZone, GeoPoint3D, MissionMapScene, RouteId, RouteLegendItem, RouteStatus } from "@/types/domain";
import type { CameraState, DroneMapHandle, MapMissionAnimationContext } from "@/types/map";

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
  routeConnector: MapEl | null;
  completedRoutes: Partial<Record<RouteId, MapEl>>;
  remainingRoutes: Partial<Record<RouteId, MapEl>>;
  originMarker: MapEl | null;
  destinationMarker: MapEl | null;
  dropOffMarker: MapEl | null;
  altDropOffAMarker: MapEl | null;
  altDropOffBMarker: MapEl | null;
  droneMarker: MapEl | null;
  droneImage: HTMLImageElement | null;
  headingMarker: MapEl | null;
  craneMarker: MapEl | null;
  craneImage: HTMLImageElement | null;
  craneGeofences: MapEl[];
  cranePulse: MapEl | null;
  altitudeObstacleMarker: MapEl | null;
  restrictedPolygons: MapEl[];
  permittedCorridor: MapEl | null;
  altitudeCeilingMarker: MapEl | null;
}

function emptyRegistry(): ElementRegistry {
  return {
    altDropOffAMarker: null,
    altDropOffBMarker: null,
    altitudeCeilingMarker: null,
    altitudeObstacleMarker: null,
    completedRoutes: {},
    craneGeofences: [],
    craneImage: null,
    craneMarker: null,
    cranePulse: null,
    destinationMarker: null,
    droneImage: null,
    droneMarker: null,
    dropOffMarker: null,
    headingMarker: null,
    map: null,
    originMarker: null,
    permittedCorridor: null,
    remainingRoutes: {},
    restrictedPolygons: [],
    routeConnector: null,
    routes: {},
  };
}

function appendMarkerImage(marker: MapEl, src: string, alt: string, sizePx: number): HTMLImageElement {
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.width = sizePx;
  image.height = sizePx;
  image.style.display = "block";
  image.style.transformOrigin = "center";
  image.style.transition = "transform 120ms linear";
  const template = document.createElement("template");
  template.content.append(image);
  marker.append(template);
  marker.setAttribute("aria-label", alt);
  return image;
}

function headingIndicatorPosition(position: GeoPoint3D, headingDeg: number): GeoPoint3D {
  const distanceM = 24;
  const radians = (headingDeg * Math.PI) / 180;
  return {
    lat: position.lat + (Math.cos(radians) * distanceM) / 111_320,
    lng: position.lng + (Math.sin(radians) * distanceM) / (111_320 * Math.cos((position.lat * Math.PI) / 180)),
    altitude: position.altitude + 2,
  };
}

export interface GoogleMaps3DViewProps extends MapMissionAnimationContext {
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
  /** When true, draw FAA-constrained corridor / restricted polygons / ceiling. */
  airspaceVisible?: boolean;
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
  {
    routeStatuses,
    selectedRoute,
    dronePosition,
    hazardVisible,
    dropOffZone,
    routes,
    statusLabel,
    reroutingBanner,
    selectedDrone,
    scene,
    airspaceVisible = false,
    approvalStatus = null,
    batteryPercent = null,
    memory = null,
    missionRun = null,
    missionStatus,
    plannedSpeedMph = null,
    routeProgress = 0,
  },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<ElementRegistry>(emptyRegistry());
  const cameraControllerRef = useRef<CameraController | null>(null);
  const prevPositionRef = useRef<GeoPoint3D>(dronePosition);
  const headingRef = useRef(0);
  const rerouteOriginRef = useRef<GeoPoint3D | null>(null);
  const hazardAnimationRef = useRef<Animation | null>(null);
  const hoverAnimationRef = useRef<Animation | null>(null);
  const cameraPresets = useMemo(() => buildCameraPresetsForScene(scene), [scene]);
  const sceneKey = `${scene.origin.lat},${scene.origin.lng}-${scene.destination.lat},${scene.destination.lng}`;
  const visualState = useMemo(
    () =>
      deriveMissionVisualState({
        approvalStatus,
        hazardVisible,
        memory,
        missionRun,
        missionStatus,
        routeStatuses,
        selectedRoute,
      }),
    [approvalStatus, hazardVisible, memory, missionRun, missionStatus, routeStatuses, selectedRoute],
  );
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error" | "missing-key">("idle");
  const [retryToken, setRetryToken] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [followEnabled, setFollowEnabled] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [altitudeStartM, setAltitudeStartM] = useState<number | null>(null);

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
    const onVisibilityChange = () => setPageVisible(!document.hidden);
    setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (statusLabel === "REROUTING") {
      setAltitudeStartM((current) => current ?? prevPositionRef.current.altitude);
    } else {
      setAltitudeStartM(null);
    }
  }, [statusLabel]);

  // --- Create the map + static scene exactly once (per API key / retry). ---
  useEffect(() => {
    let cancelled = false;
    let loadFailed = false;
    let readyTimeout: number | null = null;
    const container = containerRef.current;

    async function build() {
      if (!container) {
        return;
      }

      if (!mapsKey) {
        setLoadState("missing-key");
        return;
      }

      setLoadState("loading");

      try {
        const library = await importGoogleMapsLibrary(mapsKey, "maps3d");
        if (cancelled) {
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
          loadFailed = true;
          if (!cancelled) {
            setLoadState("error");
          }
        });

        const routeElements: Partial<Record<RouteId, MapEl>> = {};
        const completedRouteElements: Partial<Record<RouteId, MapEl>> = {};
        const remainingRouteElements: Partial<Record<RouteId, MapEl>> = {};
        scene.routes.forEach((route) => {
          const el = new Polyline3DElement({
            altitudeMode,
            coordinates: route.waypoints,
            drawsOccludedSegments: true,
            strokeColor: routeColors[visualState.displayStatuses[route.id]],
            strokeWidth: visualState.currentRoute === route.id ? 7 : 5,
          });
          map.append(el);
          routeElements[route.id] = el;

          const completed = new Polyline3DElement({
            altitudeMode,
            coordinates: route.waypoints.slice(0, 2),
            drawsOccludedSegments: true,
            strokeColor: "#166534",
            strokeWidth: 9,
            zIndex: 8,
          });
          const remaining = new Polyline3DElement({
            altitudeMode,
            coordinates: route.waypoints,
            drawsOccludedSegments: true,
            strokeColor: "#4ade80",
            strokeWidth: 9,
            zIndex: 7,
          });
          completed.style.display = "none";
          remaining.style.display = "none";
          map.append(completed);
          map.append(remaining);
          completedRouteElements[route.id] = completed;
          remainingRouteElements[route.id] = remaining;
        });
        const routeConnector = new Polyline3DElement({
          altitudeMode,
          coordinates: [scene.origin, scene.origin],
          drawsOccludedSegments: true,
          strokeColor: "#22c55e",
          strokeWidth: 7,
          zIndex: 6,
        });
        routeConnector.style.display = "none";
        map.append(routeConnector);

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
          label: "Terrace",
          position: scene.alternateDropOffA,
        });
        altDropOffAMarker.style.display = "none";
        map.append(altDropOffAMarker);

        const altDropOffBMarker = new Marker3DElement({
          altitudeMode,
          label: "Front Entrance",
          position: scene.alternateDropOffB,
        });
        altDropOffBMarker.style.display = "none";
        map.append(altDropOffBMarker);

        const hazardCenter = {
          lat: memory?.latitude ?? scene.hazard.center.lat,
          lng: memory?.longitude ?? scene.hazard.center.lng,
        };
        const [hazardMinM, hazardMaxM] = memory?.altitudeBandM ?? [90, 148];
        const hazardRadiusM = memory?.avoidanceRadiusM ?? 120;
        const craneGeofences = [hazardMinM, (hazardMinM + hazardMaxM) / 2, hazardMaxM].map((altitude, index) => {
          const geofence = new Polygon3DElement({
            altitudeMode,
            outerCoordinates: circleAroundPoint(hazardCenter, hazardRadiusM, altitude),
            extruded: index === 2,
            fillColor: index === 2 ? "rgba(239,68,68,0.20)" : "rgba(239,68,68,0.10)",
            strokeColor: index === 2 ? "#ef4444" : "rgba(239,68,68,0.55)",
            strokeWidth: index === 2 ? 3 : 1.5,
          });
          geofence.style.display = hazardVisible ? "block" : "none";
          map.append(geofence);
          return geofence;
        });
        const cranePulse = new Polygon3DElement({
          altitudeMode,
          outerCoordinates: circleAroundPoint(hazardCenter, hazardRadiusM * 1.08, hazardMaxM + 2),
          extruded: false,
          fillColor: "rgba(239,68,68,0.08)",
          strokeColor: "#f87171",
          strokeWidth: 5,
        });
        cranePulse.style.display = hazardVisible && !visualState.hazardVerified ? "block" : "none";
        map.append(cranePulse);

        const craneMarker = new Marker3DElement({
          altitudeMode,
          drawsWhenOccluded: true,
          label: `Construction Crane · Route A blocked · ${Math.round(hazardMinM)}–${Math.round(hazardMaxM)} m`,
          position: { ...hazardCenter, altitude: hazardMaxM },
          sizePreserved: true,
          zIndex: 30,
        });
        const craneImage = appendMarkerImage(craneMarker, "/demo/crane-marker.svg", "Construction Crane", 72);
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

        const restrictedPolygons = scene.airspace.restrictedPolygons.map((polygon) => {
          const el = new Polygon3DElement({
            altitudeMode,
            outerCoordinates: polygon,
            extruded: true,
            fillColor: "rgba(239,68,68,0.32)",
            strokeColor: "#ef4444",
            strokeWidth: 2,
          });
          el.style.display = airspaceVisible ? "block" : "none";
          map.append(el);
          return el;
        });

        const permittedCorridor = new Polygon3DElement({
          altitudeMode,
          outerCoordinates: scene.airspace.permittedCorridor,
          extruded: false,
          fillColor: "rgba(34,197,94,0.28)",
          strokeColor: "#22c55e",
          strokeWidth: 3,
        });
        permittedCorridor.style.display = airspaceVisible ? "block" : "none";
        map.append(permittedCorridor);

        const altitudeCeilingMarker = new Marker3DElement({
          altitudeMode,
          label: `Ceiling ${scene.airspace.maxAltitudeAglFt} ft AGL · ${scene.airspace.corridorLabel}`,
          position: scene.airspace.altitudeCeilingAnchor,
        });
        altitudeCeilingMarker.style.display = airspaceVisible ? "block" : "none";
        map.append(altitudeCeilingMarker);

        const droneMarker = new Marker3DElement({
          altitudeMode,
          drawsWhenOccluded: true,
          label: "",
          position: dronePosition,
          sizePreserved: true,
          zIndex: 40,
        });
        const droneImage = appendMarkerImage(
          droneMarker,
          selectedDrone?.includes("CargoSwift") ? "/demo/drone-cargoswift.svg" : "/demo/drone-top.svg",
          `${selectedDrone ?? "Atlas HeavyLift"} delivery drone`,
          selectedDrone?.includes("CargoSwift") ? 66 : 78,
        );
        map.append(droneMarker);

        const headingMarker = new Marker3DElement({
          altitudeMode,
          drawsWhenOccluded: true,
          label: "▲",
          position: headingIndicatorPosition(dronePosition, 0),
          sizePreserved: true,
          zIndex: 39,
        });
        headingMarker.setAttribute("aria-label", "Drone heading indicator");
        map.append(headingMarker);

        registryRef.current = {
          altDropOffAMarker,
          altDropOffBMarker,
          altitudeCeilingMarker,
          altitudeObstacleMarker,
          completedRoutes: completedRouteElements,
          craneGeofences,
          craneImage,
          craneMarker,
          cranePulse,
          destinationMarker,
          droneImage,
          droneMarker,
          dropOffMarker,
          headingMarker,
          map,
          originMarker,
          permittedCorridor,
          remainingRoutes: remainingRouteElements,
          restrictedPolygons,
          routeConnector,
          routes: routeElements,
        };

        container.replaceChildren(map);
        cameraControllerRef.current = createCameraController(
          () => registryRef.current.map as unknown as Map3DLike,
          cameraPresets,
          450,
          reducedMotion,
        );

        // The alpha 3D API's steady-state event isn't guaranteed in every
        // build; fall back to marking the scene ready shortly after append.
        readyTimeout = window.setTimeout(() => {
          if (!cancelled && !steadyStateSeen && !loadFailed) {
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
      if (readyTimeout !== null) window.clearTimeout(readyTimeout);
      hazardAnimationRef.current?.cancel();
      hazardAnimationRef.current = null;
      cameraControllerRef.current = null;
      registryRef.current = emptyRegistry();
      container?.replaceChildren();
    };
    // Runs when the key or a manual retry changes, and also rebuilds when the
    // mission's map scene changes (new geocoded pickup/drop addresses) since
    // that moves the origin/destination/route/hazard geometry itself. Route
    // status, drone position and hazard visibility are mutated afterward via
    // the effects below instead of triggering a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsKey, retryToken, sceneKey]);

  useEffect(() => {
    if (missionRun !== "MISSION_1" || !hazardVisible) {
      rerouteOriginRef.current = null;
      if (registryRef.current.routeConnector) {
        registryRef.current.routeConnector.style.display = "none";
      }
      return;
    }
    if (statusLabel === "HOLD" && rerouteOriginRef.current === null) {
      rerouteOriginRef.current = dronePosition;
    }

    const connector = registryRef.current.routeConnector;
    const routeC = scene.routes.find((route) => route.id === "C");
    if (!connector || !routeC || visualState.currentRoute !== "C" || !rerouteOriginRef.current) {
      if (connector) connector.style.display = "none";
      return;
    }
    const connectorPath = buildReroutePath(rerouteOriginRef.current, routeC.waypoints);
    connector.coordinates = connectorPath.slice(0, 2);
    connector.style.display = "block";
  }, [
    dronePosition,
    hazardVisible,
    loadState,
    missionRun,
    scene.routes,
    statusLabel,
    visualState.currentRoute,
  ]);

  // --- Route color/width updates (no recreation). ---
  useEffect(() => {
    const statuses = debugMode ? debugRouteStatuses : visualState.displayStatuses;
    const active = debugMode ? debugSim.telemetry.routeId : visualState.currentRoute;
    const { routes: routeElements, completedRoutes, remainingRoutes } = registryRef.current;

    (Object.keys(statuses) as RouteId[]).forEach((id) => {
      const el = routeElements[id];
      if (!el) return;
      el.strokeColor = routeColors[statuses[id]];
      el.strokeWidth = active === id ? 7 : 5;

      const completed = completedRoutes[id];
      const remaining = remainingRoutes[id];
      const route = scene.routes.find((candidate) => candidate.id === id);
      const showProgress = !debugMode && active === id && statuses[id] === "selected" && Boolean(route);
      if (completed) completed.style.display = showProgress ? "block" : "none";
      if (remaining) remaining.style.display = showProgress ? "block" : "none";
      if (showProgress && route && completed && remaining) {
        const split = splitRouteAtProgress(route.waypoints, routeProgress);
        completed.coordinates = split.completed;
        remaining.coordinates = split.remaining;
      }
    });
  }, [
    debugMode,
    debugRouteStatuses,
    debugSim.telemetry.routeId,
    loadState,
    routeProgress,
    scene.routes,
    visualState,
  ]);

  // --- Drone position + heading + optional camera follow (normal mode). ---
  useEffect(() => {
    if (debugMode) return;
    const { droneImage, droneMarker, headingMarker } = registryRef.current;
    if (!droneMarker) return;

    const visualRoute = scene.routes.find((route) => route.id === visualState.currentRoute);
    const gatedPosition =
      visualRoute && visualState.currentRoute !== selectedRoute
        ? sampleRouteByDistance(visualRoute.waypoints, routeProgress).position
        : dronePosition;
    const sampledHeading =
      visualRoute && visualState.currentRoute !== selectedRoute
        ? sampleRouteByDistance(visualRoute.waypoints, routeProgress).headingDeg
        : bearingDegrees(
          {
            altitudeM: prevPositionRef.current.altitude,
            lat: prevPositionRef.current.lat,
            lng: prevPositionRef.current.lng,
          },
          {
            altitudeM: gatedPosition.altitude,
            lat: gatedPosition.lat,
            lng: gatedPosition.lng,
          },
        );
    const heading = reducedMotion
      ? sampledHeading
      : interpolateBearing(headingRef.current, sampledHeading, 0.22);
    headingRef.current = heading;

    droneMarker.position = gatedPosition;
    droneMarker.label =
      visualState.eventLabel ||
      ["HOLD", "REROUTING", "TAKEOFF", "APPROACH", "DELIVERED"].includes(statusLabel)
        ? `${selectedDrone ?? "Atlas HeavyLift"} · ${statusLabel} · ${Math.round(gatedPosition.altitude)} m`
        : "";
    if (droneImage) {
      const isCargoSwift = selectedDrone?.includes("CargoSwift");
      const source = isCargoSwift ? "/demo/drone-cargoswift.svg" : "/demo/drone-top.svg";
      if (!droneImage.src.endsWith(source)) droneImage.src = source;
      droneImage.alt = `${selectedDrone ?? "Atlas HeavyLift"} delivery drone, heading ${Math.round(heading)} degrees`;
      droneImage.style.transform = `rotate(${heading}deg)`;
    }
    if (headingMarker) headingMarker.position = headingIndicatorPosition(gatedPosition, heading);
    prevPositionRef.current = gatedPosition;

    if (followEnabled) {
      if (statusLabel === "HOLD" && hazardVisible) {
        cameraControllerRef.current?.focusOnObstacle();
      } else if (statusLabel === "REROUTING") {
        cameraControllerRef.current?.showMissionOverview();
      } else if (statusLabel === "APPROACH" || statusLabel === "DROP-OFF") {
        cameraControllerRef.current?.focusOnDestination();
      } else {
        cameraControllerRef.current?.focusOnDrone(
          { altitudeM: gatedPosition.altitude, lat: gatedPosition.lat, lng: gatedPosition.lng },
          heading,
        );
      }
    }
  }, [
    debugMode,
    dronePosition,
    followEnabled,
    hazardVisible,
    loadState,
    reducedMotion,
    routeProgress,
    scene.routes,
    selectedDrone,
    selectedRoute,
    statusLabel,
    visualState,
  ]);

  // A single lightweight map-object animation is used only for stationary hover.
  useEffect(() => {
    hoverAnimationRef.current?.cancel();
    hoverAnimationRef.current = null;
    const marker = registryRef.current.droneMarker;
    if (!marker || statusLabel !== "HOLD" || reducedMotion || !pageVisible) return;
    hoverAnimationRef.current = marker.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "translateY(0)" }],
      { duration: 1800, iterations: Infinity, easing: "ease-in-out" },
    );
    return () => {
      hoverAnimationRef.current?.cancel();
      hoverAnimationRef.current = null;
    };
  }, [loadState, pageVisible, reducedMotion, statusLabel]);

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
    const { craneMarker, craneGeofences, cranePulse } = registryRef.current;
    if (craneMarker) craneMarker.style.display = visible ? "block" : "none";
    craneGeofences.forEach((geofence) => {
      geofence.style.display = visible ? "block" : "none";
    });
    if (cranePulse) {
      cranePulse.style.display = visible && !visualState.hazardVerified ? "block" : "none";
    }

    hazardAnimationRef.current?.cancel();
    hazardAnimationRef.current = null;
    if (visible && !visualState.hazardVerified && !reducedMotion && pageVisible && cranePulse) {
      hazardAnimationRef.current = cranePulse.animate(
        [{ opacity: 0.25 }, { opacity: 0.95 }, { opacity: 0.25 }],
        { duration: 1500, iterations: Infinity, easing: "ease-in-out" },
      );
    }
    return () => {
      hazardAnimationRef.current?.cancel();
      hazardAnimationRef.current = null;
    };
  }, [
    debugMode,
    debugHazardVisible,
    hazardVisible,
    loadState,
    pageVisible,
    reducedMotion,
    visualState.hazardVerified,
  ]);

  // Memory can arrive after map creation; mutate the volume instead of rebuilding the scene.
  useEffect(() => {
    const { craneGeofences, craneMarker, cranePulse } = registryRef.current;
    const center = {
      lat: memory?.latitude ?? scene.hazard.center.lat,
      lng: memory?.longitude ?? scene.hazard.center.lng,
    };
    const [minimumM, maximumM] = memory?.altitudeBandM ?? [90, 148];
    const radiusM = memory?.avoidanceRadiusM ?? 120;
    const altitudes = [minimumM, (minimumM + maximumM) / 2, maximumM];

    craneGeofences.forEach((geofence, index) => {
      geofence.outerCoordinates = circleAroundPoint(center, radiusM, altitudes[index] ?? maximumM);
    });
    if (cranePulse) {
      cranePulse.outerCoordinates = circleAroundPoint(center, radiusM * 1.08, maximumM + 2);
    }
    if (craneMarker) {
      craneMarker.position = { ...center, altitude: maximumM };
      craneMarker.label = `Construction Crane · Route A blocked · ${Math.round(minimumM)}–${Math.round(maximumM)} m`;
    }
  }, [loadState, memory, scene.hazard.center]);

  // --- Airspace compliance overlays (restricted / corridor / ceiling). ---
  useEffect(() => {
    const { restrictedPolygons, permittedCorridor, altitudeCeilingMarker } = registryRef.current;
    restrictedPolygons.forEach((el) => {
      el.style.display = airspaceVisible ? "block" : "none";
    });
    if (permittedCorridor) permittedCorridor.style.display = airspaceVisible ? "block" : "none";
    if (altitudeCeilingMarker) {
      altitudeCeilingMarker.style.display = airspaceVisible ? "block" : "none";
      altitudeCeilingMarker.label = `Ceiling ${scene.airspace.maxAltitudeAglFt} ft AGL · ${scene.airspace.corridorLabel}`;
      altitudeCeilingMarker.position = scene.airspace.altitudeCeilingAnchor;
    }
  }, [airspaceVisible, scene.airspace, loadState]);

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
  const displayedRouteId = debugMode ? debugSim.telemetry.routeId : visualState.currentRoute;
  const altitudeCallout =
    altitudeStartM !== null && Math.abs(dronePosition.altitude - altitudeStartM) >= 2
      ? `Altitude adjusted: ${Math.round(altitudeStartM)} m → ${Math.round(dronePosition.altitude)} m`
      : null;

  if (loadState === "missing-key" || loadState === "error") {
    return (
      <MapFallback
        airspaceVisible={airspaceVisible}
        approvalStatus={approvalStatus}
        batteryPercent={batteryPercent}
        dronePosition={dronePosition}
        dropOffZone={dropOffZone}
        hazardVisible={hazardVisible}
        memory={memory}
        missionRun={missionRun}
        missionStatus={missionStatus}
        onRetry={handleRetry}
        plannedSpeedMph={plannedSpeedMph}
        reason={loadState === "missing-key" ? "Maps key missing — showing deterministic route diagram." : "3D map failed to load. Showing route diagram."}
        routeProgress={routeProgress}
        routeStatuses={routeStatuses}
        scene={scene}
        selectedDrone={selectedDrone}
        selectedRoute={selectedRoute}
        statusLabel={statusLabel}
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
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    routeColorClasses[visualState.displayStatuses[route.id]],
                  )}
                />
                <span className="text-sm font-semibold text-black">{route.name}</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600">
                {route.id === "C" && visualState.routeCRecommended
                  ? "Recommended"
                  : visualState.displayStatuses[route.id]}
              </p>
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

      {visualState.eventLabel ? (
        <div className="pointer-events-none absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-[11px] font-bold text-neutral-900 shadow-[0_12px_36px_rgba(0,0,0,0.14)] backdrop-blur">
          {visualState.eventLabel === "Camera event detected" ? (
            <span className="relative flex h-3 w-3" aria-hidden="true">
              {!reducedMotion ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" /> : null}
              <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
            </span>
          ) : null}
          {visualState.eventLabel}
        </div>
      ) : null}

      {visualState.sourceLabel ? (
        <div className="pointer-events-none absolute bottom-20 left-1/2 max-w-[520px] -translate-x-1/2 rounded-full border border-neutral-200 bg-neutral-950/90 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-lg backdrop-blur">
          {visualState.sourceLabel}
        </div>
      ) : null}

      {altitudeCallout ? (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-sky-200 bg-sky-50/95 px-4 py-1.5 text-[11px] font-bold text-sky-900 shadow-lg">
          {altitudeCallout}
        </div>
      ) : null}

      {airspaceVisible && scene.airspace.authorizationRequired ? (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-red-300 bg-red-50/95 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red-800 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
          Authorization Required · Mock LAANC · Not submitted
        </div>
      ) : null}

      {airspaceVisible ? (
        <div className="pointer-events-none absolute bottom-20 left-4 max-w-[280px] rounded-[18px] border border-emerald-200 bg-white/90 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Airspace Overlay</p>
          <p className="mt-1 text-xs font-semibold text-black">{scene.airspace.corridorLabel}</p>
          <p className="mt-1 text-[11px] text-neutral-600">
            Ceiling {scene.airspace.maxAltitudeAglFt} ft AGL · red = restricted · green = candidate corridor
          </p>
        </div>
      ) : null}

      <MapStatusOverlay
        altitudeM={debugMode ? Math.round(debugSim.telemetry.position.altitudeM) : Math.round(dronePosition.altitude)}
        batteryPercent={batteryPercent}
        dropOffLabel={dropOffZone.label}
        flightMode={displayedFlightMode}
        droneName={displayedDroneName}
        followEnabled={followEnabled}
        hazardStatus={visualState.memoryLabel}
        routeId={displayedRouteId}
        speedMph={debugMode ? debugSim.telemetry.speedMph : plannedSpeedMph}
      />
      <MapSimulatedEnvironmentLabel />

      {debugMode ? (
        <details className="group">
          <summary className="pointer-events-auto absolute bottom-14 right-4 cursor-pointer list-none rounded-full border border-neutral-700 bg-neutral-950/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-lg">
            Developer map tools
          </summary>
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
        </details>
      ) : null}
    </div>
  );
});

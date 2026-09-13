import { SCENE_LABEL } from "@/data/demo-scene";
import type { DropOffZone, GeoPoint3D, MissionMapScene, RouteId, RouteStatus } from "@/types/domain";
import {
  buildReroutePath,
  deriveMissionVisualState,
  prefersReducedMotion,
  sampleRouteByDistance,
  splitRouteAtProgress,
} from "@/lib/map/mission-animation";
import type { MapMissionAnimationContext } from "@/types/map";

const routeColors: Record<RouteId, { base: string; completed: string; remaining: string }> = {
  A: { base: "#2563eb", completed: "#1e3a8a", remaining: "#3b82f6" },
  B: { base: "#f59e0b", completed: "#92400e", remaining: "#fbbf24" },
  C: { base: "#16a34a", completed: "#166534", remaining: "#4ade80" },
};
const selectedRouteColors = { base: "#16a34a", completed: "#166534", remaining: "#4ade80" };

function routeStrokeColor(id: RouteId, status: RouteStatus): string {
  if (status === "blocked") return "#ef4444";
  if (status === "selected") return selectedRouteColors.base;
  return routeColors[id].base;
}

interface MapFallbackProps extends MapMissionAnimationContext {
  reason: string;
  routeStatuses: Record<RouteId, RouteStatus>;
  selectedRoute: RouteId | null;
  hazardVisible: boolean;
  dronePosition: GeoPoint3D;
  dropOffZone: DropOffZone;
  scene: MissionMapScene;
  onRetry: () => void;
  airspaceVisible?: boolean;
  selectedDrone?: string;
  statusLabel?: string;
}

/**
 * Polished fallback used when the Maps key is missing or the 3D map fails to
 * render. Keeps the rest of the mission state legible (routes, hazard,
 * drop-off, drone position) as a simplified 2D diagram instead of a blank box.
 */
export function MapFallback({
  reason,
  routeStatuses,
  selectedRoute,
  hazardVisible,
  dronePosition,
  scene,
  onRetry,
  airspaceVisible = false,
  approvalStatus,
  batteryPercent,
  memory,
  missionRun,
  missionStatus,
  plannedSpeedMph,
  routeProgress = 0,
  selectedDrone = "Atlas HeavyLift",
  statusLabel = "MISSION",
}: MapFallbackProps) {
  const bounds = projectionBoundsForScene(scene);
  const reducedMotion = prefersReducedMotion();
  const visualState = deriveMissionVisualState({
    approvalStatus,
    hazardVisible,
    memory,
    missionRun,
    missionStatus,
    routeStatuses,
    selectedRoute,
  });
  const activeRoute = scene.routes.find((route) => route.id === visualState.currentRoute);
  const activeSample = activeRoute ? sampleRouteByDistance(activeRoute.waypoints, routeProgress) : null;
  const visualDronePosition =
    activeRoute && visualState.currentRoute !== selectedRoute ? activeSample!.position : dronePosition;
  const drone = projectFallbackPoint(visualDronePosition, bounds);
  const hazardPoint = projectFallbackPoint(
    {
      lat: memory?.latitude ?? scene.hazard.center.lat,
      lng: memory?.longitude ?? scene.hazard.center.lng,
      altitude: memory?.altitudeBandM[1] ?? scene.hazard.center.altitude,
    },
    bounds,
  );
  const hazardRadius = Math.max(
    34,
    ((memory?.avoidanceRadiusM ?? 120) / 111_320 / (bounds.maxLat - bounds.minLat)) * 300,
  );
  const corridorPoints = scene.airspace.permittedCorridor.map((point) => projectFallbackPoint(point, bounds));
  const corridorPath = corridorPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ") + " Z";
  const routePaths = scene.routes.map((route) => ({
    ...route,
    path: fallbackPath(route.waypoints, bounds),
  }));
  const activeSplit = activeRoute ? splitRouteAtProgress(activeRoute.waypoints, routeProgress) : null;
  const completedPath = activeSplit ? fallbackPath(activeSplit.completed, bounds) : "";
  const remainingPath = activeSplit ? fallbackPath(activeSplit.remaining, bounds) : "";
  const routeA = scene.routes.find((route) => route.id === "A");
  const connectorPath =
    missionRun === "MISSION_1" && visualState.currentRoute === "C" && routeA
      ? fallbackPath(
          buildReroutePath(
            sampleRouteByDistance(routeA.waypoints, 0.58).position,
            activeRoute?.waypoints ?? scene.routes.find((route) => route.id === "C")!.waypoints,
          ).slice(0, 2),
          bounds,
        )
      : "";
  const altitudeBand = memory?.altitudeBandM ?? [90, 148];
  const droneAsset = selectedDrone.includes("CargoSwift") ? "/demo/drone-cargoswift.svg" : "/demo/drone-top.svg";

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[28px] bg-white">
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
      <svg viewBox="0 0 900 460" className="relative h-full min-h-0 w-full">
        {airspaceVisible ? (
          <>
            <path d={corridorPath} fill="rgba(34,197,94,0.22)" stroke="#22c55e" strokeWidth="3" />
            {scene.airspace.restrictedPolygons.map((polygon, index) => {
              const points = polygon.map((point) => projectFallbackPoint(point, bounds));
              const path = points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ") + " Z";
              return <path key={`restricted-${index}`} d={path} fill="rgba(239,68,68,0.28)" stroke="#ef4444" strokeWidth="2.5" />;
            })}
          </>
        ) : null}
        {routePaths.map((route) => (
          <path
            key={route.id}
            d={route.path}
            stroke={routeStrokeColor(route.id, visualState.displayStatuses[route.id])}
            strokeWidth={visualState.currentRoute === route.id ? 8 : 5}
            fill="none"
            strokeLinejoin="round"
          />
        ))}
        {activeRoute && visualState.displayStatuses[activeRoute.id] === "selected" ? (
          <>
            <path
              d={remainingPath}
              stroke={selectedRouteColors.remaining}
              strokeWidth="9"
              fill="none"
              strokeDasharray="14 9"
            >
              {!reducedMotion ? <animate attributeName="stroke-dashoffset" from="23" to="0" dur="1.4s" repeatCount="indefinite" /> : null}
            </path>
            <path d={completedPath} stroke={selectedRouteColors.completed} strokeWidth="9" fill="none" />
          </>
        ) : null}
        {connectorPath ? <path d={connectorPath} stroke="#22c55e" strokeWidth="7" fill="none" strokeDasharray="8 6" /> : null}
        {hazardVisible ? (
          <g>
            <ellipse
              cx={hazardPoint.x}
              cy={hazardPoint.y + 16}
              rx={hazardRadius}
              ry={hazardRadius * 0.42}
              fill="rgba(239,68,68,0.12)"
              stroke="#ef4444"
              strokeWidth="3"
            />
            <ellipse
              cx={hazardPoint.x}
              cy={hazardPoint.y - 18}
              rx={hazardRadius}
              ry={hazardRadius * 0.42}
              fill="rgba(239,68,68,0.22)"
              stroke="#ef4444"
              strokeWidth="3"
            />
            <path
              d={`M${hazardPoint.x - hazardRadius} ${hazardPoint.y - 18}v34M${hazardPoint.x + hazardRadius} ${hazardPoint.y - 18}v34`}
              stroke="#ef4444"
              strokeWidth="2"
              opacity=".7"
            />
            {!visualState.hazardVerified ? (
              <ellipse
                cx={hazardPoint.x}
                cy={hazardPoint.y - 18}
                rx={hazardRadius}
                ry={hazardRadius * 0.42}
                fill="none"
                stroke="#f87171"
                strokeWidth="5"
              >
                {!reducedMotion ? <animate attributeName="opacity" values=".2;1;.2" dur="1.5s" repeatCount="indefinite" /> : null}
              </ellipse>
            ) : null}
            <image
              href="/demo/crane-marker.svg"
              x={hazardPoint.x - 28}
              y={hazardPoint.y - 92}
              width="56"
              height="68"
              aria-label="Construction Crane"
            />
            <text x={hazardPoint.x} y={hazardPoint.y + 55} textAnchor="middle" fill="#991b1b" fontSize="13" fontWeight="800">
              Route A BLOCKED · {altitudeBand[0]}–{altitudeBand[1]} m
            </text>
          </g>
        ) : null}
        <g transform={`translate(${drone.x} ${drone.y}) rotate(${activeSample?.headingDeg ?? 0})`}>
          <image href={droneAsset} x="-34" y="-34" width="68" height="68" aria-label={`${selectedDrone} delivery drone`} />
          <path d="M0-42 -6-31H6Z" fill="#16a34a" />
        </g>
      </svg>
      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-neutral-200 bg-white/92 p-3 shadow-lg backdrop-blur">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500">Route status</p>
        <div className="mt-2 flex gap-3">
          {(["A", "B", "C"] as RouteId[]).map((id) => (
            <span key={id} className="text-[10px] font-bold uppercase text-neutral-700">
              {id} · {id === "C" && visualState.routeCRecommended ? "Recommended" : visualState.displayStatuses[id]}
            </span>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 rounded-2xl border border-neutral-200 bg-white/92 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-700 shadow-lg backdrop-blur">
        <p>{statusLabel} · Route {visualState.currentRoute ?? "-"}</p>
        <p>{Math.round(visualDronePosition.altitude)} m · {Math.round(plannedSpeedMph ?? 0)} mph</p>
        {batteryPercent !== null && batteryPercent !== undefined ? <p>{Math.round(batteryPercent)}% battery</p> : null}
        <p>Hazard memory: {visualState.memoryLabel}</p>
      </div>
      {visualState.eventLabel ? (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-[11px] font-bold text-neutral-900 shadow-lg">
          {visualState.eventLabel}
        </div>
      ) : null}
      {visualState.sourceLabel ? (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-neutral-950/90 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          {visualState.sourceLabel}
        </div>
      ) : null}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <span className="rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600 backdrop-blur">
          Fallback map · {reason}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-neutral-900 bg-neutral-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-neutral-700"
        >
          Retry Map
        </button>
      </div>
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <span className="rounded-full border border-neutral-200 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500 backdrop-blur">
          {SCENE_LABEL}
        </span>
      </div>
    </div>
  );
}

interface ProjectionBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function fallbackPath(points: GeoPoint3D[], bounds: ProjectionBounds): string {
  return points
    .map((point, index) => {
      const projected = projectFallbackPoint(point, bounds);
      return `${index === 0 ? "M" : "L"}${projected.x} ${projected.y}`;
    })
    .join(" ");
}

/** Derives a padded bounding box from the mission's actual origin/destination so the schematic still lines up for real, geocoded addresses. */
function projectionBoundsForScene(scene: MissionMapScene): ProjectionBounds {
  const lats = [
    scene.origin.lat,
    scene.destination.lat,
    scene.hazard.center.lat,
    ...scene.airspace.permittedCorridor.map((point) => point.lat),
  ];
  const lngs = [
    scene.origin.lng,
    scene.destination.lng,
    scene.hazard.center.lng,
    ...scene.airspace.permittedCorridor.map((point) => point.lng),
  ];
  const rawMinLat = Math.min(...lats);
  const rawMaxLat = Math.max(...lats);
  const rawMinLng = Math.min(...lngs);
  const rawMaxLng = Math.max(...lngs);
  const latPad = Math.max((rawMaxLat - rawMinLat) * 0.25, 0.002);
  const lngPad = Math.max((rawMaxLng - rawMinLng) * 0.25, 0.002);

  return {
    minLat: rawMinLat - latPad,
    maxLat: rawMaxLat + latPad,
    minLng: rawMinLng - lngPad,
    maxLng: rawMaxLng + lngPad,
  };
}

function projectFallbackPoint(point: GeoPoint3D, bounds: ProjectionBounds) {
  const { minLat, maxLat, minLng, maxLng } = bounds;

  return {
    x: 80 + ((point.lng - minLng) / (maxLng - minLng)) * 740,
    y: 390 - ((point.lat - minLat) / (maxLat - minLat)) * 300,
  };
}

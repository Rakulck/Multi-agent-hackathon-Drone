import { SCENE_LABEL } from "@/data/demo-scene";
import type { DropOffZone, GeoPoint3D, MissionMapScene, RouteId, RouteStatus } from "@/types/domain";

const routeColors: Record<RouteStatus, string> = {
  candidate: "#171717",
  selected: "#22c55e",
  warning: "#f59e0b",
  blocked: "#ef4444",
};

interface MapFallbackProps {
  reason: string;
  routeStatuses: Record<RouteId, RouteStatus>;
  selectedRoute: RouteId | null;
  hazardVisible: boolean;
  dronePosition: GeoPoint3D;
  dropOffZone: DropOffZone;
  scene: MissionMapScene;
  onRetry: () => void;
  airspaceVisible?: boolean;
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
  dropOffZone,
  scene,
  onRetry,
  airspaceVisible = false,
}: MapFallbackProps) {
  const bounds = projectionBoundsForScene(scene);
  const drone = projectFallbackPoint(dronePosition, bounds);
  const dropOff = projectFallbackPoint(dropOffZone.point, bounds);
  const corridorPoints = scene.airspace.permittedCorridor.map((point) => projectFallbackPoint(point, bounds));
  const corridorPath = corridorPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ") + " Z";

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
        <path d="M90 340 C250 180 410 130 790 110" stroke={routeColors[routeStatuses.A]} strokeWidth={selectedRoute === "A" ? 9 : 6} fill="none" />
        <path d="M90 340 C260 320 460 250 790 110" stroke={routeColors[routeStatuses.B]} strokeWidth={selectedRoute === "B" ? 9 : 6} fill="none" />
        <path d="M90 340 C230 410 530 390 790 110" stroke={routeColors[routeStatuses.C]} strokeWidth={selectedRoute === "C" ? 9 : 6} fill="none" />
        {hazardVisible ? <circle cx="505" cy="175" r="46" fill="rgba(239,68,68,0.3)" stroke="#ef4444" strokeWidth="4" /> : null}
        <circle cx="90" cy="340" r="12" fill="#93c5fd" />
        <circle cx="790" cy="110" r="12" fill="#34d399" />
        <circle cx={dropOff.x} cy={dropOff.y} r="9" fill="none" stroke="#171717" strokeDasharray="3 3" strokeWidth="2.5" />
        <circle cx={drone.x} cy={drone.y} r="14" fill="#000000" />
        <circle cx={drone.x} cy={drone.y} r="5" fill="#ffffff" />
        {airspaceVisible ? (
          <text x="420" y="40" textAnchor="middle" fill="#166534" fontSize="14" fontWeight="700">
            {scene.airspace.corridorLabel} · {scene.airspace.maxAltitudeAglFt} ft AGL
          </text>
        ) : null}
      </svg>
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <span className="rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600 backdrop-blur">
          {reason}
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
        {airspaceVisible && scene.airspace.authorizationRequired ? (
          <span className="rounded-full border border-red-300 bg-red-50/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-800 backdrop-blur">
            Authorization Required
          </span>
        ) : null}
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

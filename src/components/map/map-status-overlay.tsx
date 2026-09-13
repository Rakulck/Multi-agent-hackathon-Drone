import { SCENE_LABEL } from "@/data/demo-scene";

interface MapStatusOverlayProps {
  altitudeM: number;
  batteryPercent?: number | null;
  flightMode: string;
  routeId: string | null;
  followEnabled: boolean;
  hazardStatus: string;
  speedMph?: number | null;
}

/**
 * Small bottom-left overlay: flight mode / drone / active route / camera
 * follow status only. Speed, altitude, battery and agent reasoning stay in
 * the right-side Live Mission panel, not duplicated here.
 */
export function MapStatusOverlay({
  altitudeM,
  batteryPercent,
  flightMode,
  routeId,
  followEnabled,
  hazardStatus,
  speedMph,
}: MapStatusOverlayProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-neutral-200 bg-white/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
      <div className="flex items-center gap-2 text-xs text-black">
        <span>{flightMode}</span>
        <span aria-hidden="true">·</span>
        <span>Route {routeId ?? "-"}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{altitudeM} m</span>
        <span>{speedMph === null || speedMph === undefined ? "--" : Math.round(speedMph)} mph</span>
        {batteryPercent !== null && batteryPercent !== undefined ? <span>{Math.round(batteryPercent)}% battery</span> : null}
      </div>
      <p>Hazard memory: {hazardStatus}</p>
      <p>Camera: {followEnabled ? "Follow Drone" : "Overview"}</p>
    </div>
  );
}

export function MapSimulatedEnvironmentLabel() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-neutral-200 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500 backdrop-blur">
      {SCENE_LABEL}
    </div>
  );
}

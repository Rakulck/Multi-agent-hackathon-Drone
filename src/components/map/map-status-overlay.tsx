import { SCENE_LABEL } from "@/data/demo-scene";

interface MapStatusOverlayProps {
  flightMode: string;
  droneName: string;
  routeId: string | null;
  followEnabled: boolean;
  dropOffLabel: string;
}

/**
 * Small bottom-left overlay: flight mode / drone / active route / camera
 * follow status only. Speed, altitude, battery and agent reasoning stay in
 * the right-side Live Mission panel, not duplicated here.
 */
export function MapStatusOverlay({ flightMode, droneName, routeId, followEnabled, dropOffLabel }: MapStatusOverlayProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-neutral-200 bg-white/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
      <p className="text-xs text-black">{flightMode}</p>
      <p>{droneName}</p>
      <p>Route {routeId ?? "-"}</p>
      <p>Camera Follow: {followEnabled ? "On" : "Off"}</p>
      <p className="mt-1 normal-case tracking-normal text-neutral-500">Drop-off: {dropOffLabel}</p>
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

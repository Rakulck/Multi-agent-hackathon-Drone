interface MapTestControlsProps {
  onSpawnAtlas: () => void;
  onSpawnCargoSwift: () => void;
  onStartRoute: (routeId: "A" | "B" | "C") => void;
  onPause: () => void;
  onResume: () => void;
  onBlockRouteA: () => void;
  onSelectRouteC: () => void;
  onToggleCrane: () => void;
  onChangeAltitude: () => void;
  onChangeDestination: () => void;
  onReset: () => void;
}

const buttonClass =
  "rounded-full border border-neutral-700 bg-neutral-900/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-neutral-700";

/**
 * Development-only harness that verifies the 3D environment in isolation
 * (spawn / route / pause / obstacle / destination / reset). Only visible
 * with `?debugMap=1`. This is not a second mission-control UI — it drives the
 * standalone animation engine, not the live mission state machine.
 */
export function MapTestControls({
  onSpawnAtlas,
  onSpawnCargoSwift,
  onStartRoute,
  onPause,
  onResume,
  onBlockRouteA,
  onSelectRouteC,
  onToggleCrane,
  onChangeAltitude,
  onChangeDestination,
  onReset,
}: MapTestControlsProps) {
  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 max-w-[320px] rounded-2xl border border-neutral-700 bg-neutral-950/90 p-3 text-white shadow-[0_12px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Map Test Controls (dev only)</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={buttonClass} onClick={onSpawnAtlas}>Spawn Atlas</button>
        <button type="button" className={buttonClass} onClick={onSpawnCargoSwift}>Spawn CargoSwift</button>
        <button type="button" className={buttonClass} onClick={() => onStartRoute("A")}>Start Route A</button>
        <button type="button" className={buttonClass} onClick={() => onStartRoute("B")}>Start Route B</button>
        <button type="button" className={buttonClass} onClick={() => onStartRoute("C")}>Start Route C</button>
        <button type="button" className={buttonClass} onClick={onPause}>Pause</button>
        <button type="button" className={buttonClass} onClick={onResume}>Resume</button>
        <button type="button" className={buttonClass} onClick={onBlockRouteA}>Block Route A</button>
        <button type="button" className={buttonClass} onClick={onSelectRouteC}>Select Route C</button>
        <button type="button" className={buttonClass} onClick={onToggleCrane}>Show Crane</button>
        <button type="button" className={buttonClass} onClick={onChangeAltitude}>Change Altitude</button>
        <button type="button" className={buttonClass} onClick={onChangeDestination}>Change Destination</button>
        <button type="button" className={buttonClass} onClick={onReset}>Reset Scene</button>
      </div>
    </div>
  );
}

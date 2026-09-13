"use client";

import { cn } from "@/lib/utils";
import type { ConnectionHealth, FlightMode, RouteId } from "@/types/domain";

const flightModeClasses: Record<FlightMode, string> = {
  TAKEOFF: "bg-neutral-900 text-white",
  CRUISE: "bg-emerald-600 text-white",
  HOLD: "bg-amber-500 text-white",
  EVALUATING: "bg-neutral-200 text-neutral-700",
  REROUTING: "bg-amber-500 text-white",
  APPROACH: "bg-emerald-600 text-white",
  "DROP-OFF": "bg-black text-white",
  RETURNING: "bg-neutral-900 text-white",
  DELIVERED: "bg-emerald-600 text-white",
};

interface LiveDroneStateProps {
  altitudeM: number;
  batteryPercent: number;
  connectionHealth: ConnectionHealth;
  etaLabel: string;
  flightMode: FlightMode;
  selectedRoute: RouteId | null;
  speedKmh: number;
  waypointLabel: string;
}

export function LiveDroneState({
  altitudeM,
  batteryPercent,
  connectionHealth,
  etaLabel,
  flightMode,
  selectedRoute,
  speedKmh,
  waypointLabel,
}: LiveDroneStateProps) {
  return (
    <div className="shrink-0 rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Speed" value={`${speedKmh} km/h`} />
        <Metric label="Altitude" value={`${altitudeM} m`} />
        <Metric label="Battery" value={`${Math.max(0, Math.round(batteryPercent))}%`} />
        <Metric label="ETA" value={etaLabel} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Pill className={flightModeClasses[flightMode]}>{flightMode}</Pill>
        <Pill className="bg-neutral-100 text-neutral-700">{selectedRoute ? `Route ${selectedRoute}` : "No route"}</Pill>
        <Pill className="bg-neutral-100 text-neutral-700">{waypointLabel}</Pill>
        <Pill
          className={cn(
            connectionHealth === "Nominal" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
          )}
        >
          {connectionHealth === "Nominal" ? "Link nominal" : "Link degraded"}
        </Pill>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-2 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className="font-geist mt-1 text-lg font-semibold tracking-[-0.03em] text-black">{value}</p>
    </div>
  );
}

function Pill({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]", className)}>
      {children}
    </span>
  );
}

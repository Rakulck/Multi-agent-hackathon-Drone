"use client";

import { cn } from "@/lib/utils";
import type { ApprovedPlan, Mission } from "@/types/domain";

interface ApprovedPlanCardProps {
  canLaunch: boolean;
  isRunning: boolean;
  mission: Mission | null;
  onLaunch: () => void;
  plan: ApprovedPlan | null;
}

export function ApprovedPlanCard({ canLaunch, isRunning, mission, onLaunch, plan }: ApprovedPlanCardProps) {
  if (!plan || !mission) {
    return null;
  }

  const weather = mission.weatherEvaluation
    ? `${mission.weatherEvaluation.severity} · ${mission.weather?.windMph ?? "—"} mph wind`
    : "Unavailable";
  const selectedAirspace = mission.airspaceEval?.routeResults.find(
    (route) => route.id === plan.routeId,
  );
  const airspace = selectedAirspace?.eligible
    ? `Allowed · ${selectedAirspace.plannedAglFt} ft AGL`
    : "Not allowed";
  const craneAffectedRoute =
    mission.pattern === "MISSION_2" && plan.memoriesUsed.length > 0;

  return (
    <div className="shrink-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">Final plan</p>
          <p className="mt-0.5 text-sm font-bold text-black">Ready to launch</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
          {plan.approvalStatus}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-3 text-[11px] sm:grid-cols-5">
        <PlanField label="Drone type" value={plan.droneModel} />
        <PlanField label="Weather" value={weather} />
        <PlanField label="Airspace" value={airspace} />
        <PlanField
          label="Route chosen"
          value={`Route ${plan.routeId}${craneAffectedRoute ? " · changed from A" : ""}`}
        />
        <PlanField
          label="Obstacle"
          value={craneAffectedRoute ? "Construction crane" : "None detected"}
        />
      </div>

      {craneAffectedRoute ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Verified crane memory blocked Route A · route changed from A → B before launch.
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canLaunch || isRunning}
        onClick={onLaunch}
        className={cn(
          "mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border text-sm font-bold transition",
          !canLaunch || isRunning
            ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
            : "border-black bg-black text-white hover:bg-neutral-800",
        )}
      >
        Launch Mission
      </button>
    </div>
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold uppercase tracking-[0.1em] text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold text-black">{value}</p>
    </div>
  );
}

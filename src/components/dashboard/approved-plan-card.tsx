"use client";

import { cn } from "@/lib/utils";
import type { ApprovedPlan } from "@/types/domain";

interface ApprovedPlanCardProps {
  canLaunch: boolean;
  isRunning: boolean;
  onLaunch: () => void;
  plan: ApprovedPlan | null;
}

export function ApprovedPlanCard({ canLaunch, isRunning, onLaunch, plan }: ApprovedPlanCardProps) {
  if (!plan) {
    return null;
  }

  return (
    <div className="shrink-0 rounded-[22px] border border-neutral-200 bg-white p-4 shadow-[0_14px_40px_rgba(0,0,0,0.07)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Approved Plan V{plan.version}</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
          {plan.approvalStatus}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
        <PlanField label="Drone" value={plan.droneModel} />
        <PlanField label="Route" value={`Route ${plan.routeId}`} />
        <PlanField label="Speed" value={`${plan.speedMph} mph`} />
        <PlanField label="Altitude" value={plan.altitudeCorridor} />
        <PlanField label="Battery reserve" value={plan.batteryReserve} />
        <PlanField label="Weather timestamp" value={plan.weatherTimestamp} />
        <PlanField label="Primary drop-off" value={plan.primaryDropOff} />
        <PlanField label="Backup drop-off" value={plan.backupDropOff} />
        <PlanField label="Memories used" value={plan.memoriesUsed.length > 0 ? plan.memoriesUsed.join(", ") : "None"} />
      </div>

      <button
        type="button"
        disabled={!canLaunch || isRunning}
        onClick={onLaunch}
        className={cn(
          "mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border text-sm font-bold uppercase tracking-[0.08em] transition",
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

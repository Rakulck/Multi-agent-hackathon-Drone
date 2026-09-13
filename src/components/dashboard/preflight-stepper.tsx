"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { preflightStepOrder } from "@/types/domain";
import type { PreflightStepId, StepStatus } from "@/types/domain";

const stepLabels: Record<PreflightStepId, string> = {
  REQUEST: "Request",
  FLEET: "Fleet",
  WEATHER: "Weather",
  AIRSPACE: "Airspace",
  MEMORY: "Memory",
  ROUTES: "Routes",
  APPROVAL: "Approval",
  READY: "Ready",
};

const nodeClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-100 text-neutral-400",
  Evaluating: "bg-blue-600 text-white ring-4 ring-blue-100",
  Completed: "bg-emerald-600 text-white",
  Warning: "bg-amber-500 text-white",
  Failed: "bg-red-600 text-white",
};

const connectorClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-200",
  Evaluating: "bg-neutral-200",
  Completed: "bg-emerald-500",
  Warning: "bg-amber-400",
  Failed: "bg-red-500",
};

interface PreflightStepperProps {
  statuses: Record<PreflightStepId, StepStatus>;
}

export function PreflightStepper({ statuses }: PreflightStepperProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-[20px] border border-neutral-200 bg-white px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      {preflightStepOrder.map((stepId, index) => {
        const status = statuses[stepId];

        return (
          <div key={stepId} className="flex flex-1 items-center gap-1.5">
            <div className="flex flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition",
                  nodeClasses[status],
                )}
              >
                {status === "Completed" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : status === "Evaluating" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em]",
                  status === "Waiting" ? "text-neutral-400" : "text-black",
                )}
              >
                {stepLabels[stepId]}
              </span>
            </div>
            {index < preflightStepOrder.length - 1 ? (
              <span className={cn("mb-4 h-0.5 flex-1 rounded-full transition", connectorClasses[status])} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

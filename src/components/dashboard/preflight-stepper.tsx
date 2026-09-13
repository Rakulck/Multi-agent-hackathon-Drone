"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { preflightStepOrder } from "@/types/domain";
import type { PreflightStepId, StepEvidence, StepStatus } from "@/types/domain";

const stepLabels: Record<PreflightStepId, string> = {
  REQUEST: "Request",
  FLEET: "Fleet",
  WEATHER: "Weather",
  AIRSPACE: "Airspace",
  MEMORY: "Memory",
  ROUTES: "Route",
  APPROVAL: "Approval",
  READY: "Ready",
};

const nodeClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-100 text-neutral-400",
  Evaluating: "bg-blue-600 text-white ring-4 ring-blue-100",
  Completed: "bg-emerald-600 text-white",
  Warning: "bg-amber-500 text-white",
  Failed: "bg-red-600 text-white",
  Approval: "bg-violet-600 text-white",
};

const connectorClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-200",
  Evaluating: "bg-neutral-200",
  Completed: "bg-emerald-500",
  Warning: "bg-amber-400",
  Failed: "bg-red-500",
  Approval: "bg-violet-500",
};

const stepReasons: Record<PreflightStepId, string> = {
  REQUEST: "Validating the delivery request and payload requirements.",
  FLEET: "Finding an available drone with enough payload, range, and battery.",
  WEATHER: "Checking wind, visibility, and the selected drone’s operating limits.",
  AIRSPACE: "Verifying altitude, geofence, and corridor compliance.",
  MEMORY: "Checking shared operational memory for known route hazards.",
  ROUTES: "Selecting the safest compliant route before takeoff.",
  APPROVAL: "Determining whether the plan can proceed or needs operator review.",
  READY: "Compiling the approved drone, route, and speed into the launch plan.",
};

interface PreflightStepperProps {
  activeStepId: PreflightStepId | null;
  steps: Record<PreflightStepId, StepEvidence>;
}

export function PreflightStepper({ activeStepId, steps }: PreflightStepperProps) {
  const activeStep = activeStepId ? steps[activeStepId] : null;
  const activeReason =
    activeStep?.status === "Evaluating"
      ? stepReasons[activeStep.id]
      : activeStep?.summary || activeStep?.decision || "Preparing the automated safety checks.";

  return (
    <div className="shrink-0 rounded-[20px] border border-neutral-200 bg-white px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {preflightStepOrder.map((stepId, index) => {
          const status = steps[stepId].status;

          return (
            <div key={stepId} className="flex min-w-[76px] flex-1 items-center gap-1.5">
              <div className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
                    nodeClasses[status],
                    status === "Evaluating" && "scale-110 shadow-lg shadow-blue-200",
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
                <span
                  className={cn(
                    "mb-4 h-0.5 flex-1 rounded-full transition-colors duration-500",
                    connectorClasses[status],
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="mt-3 flex min-w-0 items-center gap-2 border-t border-neutral-100 pt-3"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            activeStep?.status === "Evaluating" ? "animate-pulse bg-blue-600" : "bg-emerald-500",
          )}
        />
        <p className="min-w-0 truncate text-xs font-medium text-neutral-600">
          <span className="font-bold text-black">
            {activeStep ? `${stepLabels[activeStep.id]}: ` : "Automatic preflight: "}
          </span>
          {activeReason}
        </p>
      </div>
    </div>
  );
}

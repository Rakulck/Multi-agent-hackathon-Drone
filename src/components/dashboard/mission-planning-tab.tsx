"use client";

import { Loader2, Play, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { preflightStepOrder } from "@/types/domain";
import { MissionListPanel } from "@/components/dashboard/mission-list-panel";
import { PreflightStepper } from "@/components/dashboard/preflight-stepper";
import { StepEvidenceCard } from "@/components/dashboard/step-evidence-card";
import { ApprovedPlanCard } from "@/components/dashboard/approved-plan-card";
import { HumanInLoopPanel } from "@/components/live-mission/human-in-loop-panel";
import type { Mission, WeatherMode } from "@/types/domain";
import type { ApprovalDecision, ApprovalRequest } from "@/types/domain";

interface MissionPlanningTabProps {
  approval: ApprovalRequest | null;
  isLaunching: boolean;
  isRunningPreflight: boolean;
  missions: Mission[];
  onCreatePreset: (pattern: Mission["pattern"]) => void;
  onLaunchMission: () => void;
  onResolveApproval: (decision: ApprovalDecision) => void;
  onNextStep: () => void;
  onReset: () => void;
  onRunPreflight: () => void;
  onSelectMission: (id: string) => void;
  onWeatherModeChange: (mode: WeatherMode) => void;
  selectedMission: Mission | null;
}

export function MissionPlanningTab({
  approval,
  isLaunching,
  isRunningPreflight,
  missions,
  onCreatePreset,
  onLaunchMission,
  onResolveApproval,
  onNextStep,
  onReset,
  onRunPreflight,
  onSelectMission,
  onWeatherModeChange,
  selectedMission,
}: MissionPlanningTabProps) {
  const activeStep = selectedMission?.activeStepId ? selectedMission.steps[selectedMission.activeStepId] : null;
  const isAutomatedPreset = Boolean(selectedMission?.isDemoPreset);
  const isWeatherSelection =
    activeStep?.id === "WEATHER" && activeStep.status === "Waiting";
  const weatherSelectionReady =
    isWeatherSelection &&
    (selectedMission?.weatherMode === "SAFE" ||
      (selectedMission?.weatherMode === "MODERATE" &&
        selectedMission.weatherApprovalGranted) ||
      (selectedMission?.weatherMode === "LIVE" &&
        selectedMission.weatherFetchState === "SUCCESS" &&
        selectedMission.weatherEvaluation !== null &&
        !selectedMission.weatherEvaluation.paused));
  const canRunPreflight = Boolean(selectedMission) && selectedMission?.lifecycle === "NEW" && !isRunningPreflight;
  const canLaunch = selectedMission?.lifecycle === "READY";
  const hasNextStep = Boolean(
    selectedMission &&
      selectedMission.lifecycle === "PREFLIGHT" &&
      preflightStepOrder.some((id) => selectedMission.steps[id].status === "Waiting"),
  );
  const canAdvanceStep =
    Boolean(selectedMission) &&
    hasNextStep &&
    !isRunningPreflight &&
    Boolean(activeStep) &&
    (isWeatherSelection
      ? weatherSelectionReady
      : activeStep?.status !== "Waiting") &&
    activeStep?.status !== "Evaluating";
  const canChangeWeatherMode =
    Boolean(selectedMission) && selectedMission?.steps.WEATHER.status === "Waiting" && !isRunningPreflight;

  return (
    <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <MissionListPanel
        disablePresetCreation={isRunningPreflight}
        missions={missions}
        onCreatePreset={onCreatePreset}
        onSelectMission={onSelectMission}
        selectedMissionId={selectedMission?.id ?? null}
      />

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isAutomatedPreset ? (
            <div className="ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700">
              {isRunningPreflight ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {selectedMission?.lifecycle === "HOLD"
                ? "Paused for operator review"
                : isRunningPreflight
                  ? "Running automatic preflight"
                  : selectedMission?.lifecycle === "READY"
                    ? "Automatic preflight complete"
                    : "Automatic preflight enabled"}
            </div>
          ) : (
            <button
              type="button"
              disabled={!canRunPreflight}
              onClick={onRunPreflight}
              className={cn(
                "ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition",
                !canRunPreflight
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                  : "border-black bg-black text-white hover:bg-neutral-800",
              )}
            >
              <Play className="h-3.5 w-3.5" />
              Run Preflight
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            title="Reset"
            aria-label="Reset"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition hover:border-black hover:text-black"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {selectedMission ? (
          <PreflightStepper
            activeStepId={selectedMission.activeStepId}
            steps={selectedMission.steps}
          />
        ) : null}

        {!isAutomatedPreset ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            {!selectedMission ? (
              <EmptyState />
            ) : activeStep ? (
              <StepEvidenceCard
                canAdvance={canAdvanceStep}
                controls={
                  activeStep.id === "WEATHER" ? (
                    <WeatherModeControl
                      disabled={!canChangeWeatherMode}
                      mode={selectedMission.weatherMode}
                      onChange={onWeatherModeChange}
                    />
                  ) : undefined
                }
                isAdvancing={isRunningPreflight}
                onNext={onNextStep}
                showAdvance={isWeatherSelection}
                step={activeStep}
              />
            ) : (
              <EmptyState message="Run Preflight to begin the sequential evaluation." />
            )}
          </div>
        ) : null}

        <ApprovedPlanCard
          canLaunch={Boolean(canLaunch)}
          isRunning={isLaunching}
          mission={selectedMission}
          onLaunch={onLaunchMission}
          plan={selectedMission?.plan ?? null}
        />
        {approval && approval.missionId === selectedMission?.id ? (
          <HumanInLoopPanel
            approval={approval}
            isRunning={isRunningPreflight}
            onResolveApproval={onResolveApproval}
            onSimulateApproval={() => undefined}
          />
        ) : null}
      </div>
    </section>
  );
}

const weatherModes: Array<{ id: WeatherMode; label: string }> = [
  { id: "LIVE", label: "Live" },
  { id: "MODERATE", label: "Moderate" },
  { id: "SAFE", label: "Safe" },
];

function WeatherModeControl({
  disabled,
  mode,
  onChange,
}: {
  disabled: boolean;
  mode: WeatherMode;
  onChange: (mode: WeatherMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
      <span className="pl-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Weather</span>
      <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
        {weatherModes.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[10px] font-bold transition",
              mode === option.id ? "bg-black text-white shadow-sm" : "text-neutral-500 hover:bg-white hover:text-black",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message = "Create a mission to begin preflight." }: { message?: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-dashed border-neutral-200 bg-white/60 p-6 text-center text-sm font-medium text-neutral-400">
      {message}
    </div>
  );
}

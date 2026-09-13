"use client";

import { Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { preflightStepOrder } from "@/types/domain";
import { MissionListPanel } from "@/components/dashboard/mission-list-panel";
import { PreflightStepper } from "@/components/dashboard/preflight-stepper";
import { StepEvidenceCard, StepHistoryRow } from "@/components/dashboard/step-evidence-card";
import { ApprovedPlanCard } from "@/components/dashboard/approved-plan-card";
import type { Mission, PreflightStepId, StepStatus, WeatherMode } from "@/types/domain";

interface MissionPlanningTabProps {
  isLaunching: boolean;
  isRunningPreflight: boolean;
  missions: Mission[];
  onCreatePreset: (pattern: Mission["pattern"]) => void;
  onLaunchMission: () => void;
  onNewMission: () => void;
  onNextStep: () => void;
  onReset: () => void;
  onRunPreflight: () => void;
  onSelectMission: (id: string) => void;
  onWeatherModeChange: (mode: WeatherMode) => void;
  selectedMission: Mission | null;
}

export function MissionPlanningTab({
  isLaunching,
  isRunningPreflight,
  missions,
  onCreatePreset,
  onLaunchMission,
  onNewMission,
  onNextStep,
  onReset,
  onRunPreflight,
  onSelectMission,
  onWeatherModeChange,
  selectedMission,
}: MissionPlanningTabProps) {
  const summary = buildSummaryItems(selectedMission);
  const stepStatuses: Record<PreflightStepId, StepStatus> = Object.fromEntries(
    preflightStepOrder.map((id) => [id, selectedMission?.steps[id].status ?? "Waiting"]),
  ) as Record<PreflightStepId, StepStatus>;
  const activeStep = selectedMission?.activeStepId ? selectedMission.steps[selectedMission.activeStepId] : null;
  const historySteps = selectedMission
    ? preflightStepOrder
        .filter((id) => id !== selectedMission.activeStepId && selectedMission.steps[id].status !== "Waiting")
        .map((id) => selectedMission.steps[id])
    : [];
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
    activeStep?.status !== "Waiting" &&
    activeStep?.status !== "Evaluating";
  const canChangeWeatherMode =
    Boolean(selectedMission) && selectedMission?.steps.WEATHER.status === "Waiting" && !isRunningPreflight;

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[22%_78%] gap-3">
      <MissionListPanel
        missions={missions}
        onCreatePreset={onCreatePreset}
        onNewMission={onNewMission}
        onSelectMission={onSelectMission}
        selectedMissionId={selectedMission?.id ?? null}
      />

      <div className="flex min-h-0 flex-col gap-3">
        <SummaryRow items={summary} />

        <div className="flex shrink-0 items-center justify-between gap-2">
          <WeatherModeControl
            disabled={!canChangeWeatherMode}
            mode={selectedMission?.weatherMode ?? "LIVE"}
            onChange={onWeatherModeChange}
          />
          <button
            type="button"
            disabled={!canRunPreflight}
            onClick={onRunPreflight}
            className={cn(
              "inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-bold uppercase tracking-[0.08em] transition",
              !canRunPreflight
                ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                : "border-black bg-black text-white hover:bg-neutral-800",
            )}
          >
            <Play className="h-3.5 w-3.5" />
            Run Preflight
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-neutral-300 bg-white px-3 text-xs font-bold text-black transition hover:border-black"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <PreflightStepper statuses={stepStatuses} />

        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          {!selectedMission ? (
            <EmptyState />
          ) : activeStep ? (
            <StepEvidenceCard
              canAdvance={canAdvanceStep}
              isAdvancing={isRunningPreflight}
              onNext={onNextStep}
              step={activeStep}
            />
          ) : (
            <EmptyState message="Run Preflight to begin the sequential evaluation." />
          )}

          {historySteps.length > 0 ? (
            <div className="max-h-[132px] shrink-0 space-y-1.5 overflow-y-auto rounded-[18px] bg-white/60 p-1.5">
              {historySteps.map((step) => (
                <StepHistoryRow key={step.id} step={step} />
              ))}
            </div>
          ) : null}
        </div>

        <ApprovedPlanCard
          canLaunch={Boolean(canLaunch)}
          isRunning={isLaunching}
          onLaunch={onLaunchMission}
          plan={selectedMission?.plan ?? null}
        />
      </div>
    </section>
  );
}

const weatherModes: Array<{ id: WeatherMode; label: string }> = [
  { id: "LIVE", label: "Live" },
  { id: "SAFE", label: "Safe" },
  { id: "MODERATE", label: "Moderate" },
  { id: "UNSAFE", label: "Unsafe" },
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
    <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-1.5">
      <span className="pl-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">Weather</span>
      <div className="flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
        {weatherModes.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition",
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

function SummaryRow({ items }: { items: SummaryItem[] }) {
  return (
    <section className="grid h-[72px] shrink-0 grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-[20px] border border-neutral-200 bg-white px-4 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{item.label}</p>
          <p className="font-geist mt-1 text-xl font-semibold tracking-[-0.04em] text-black">{item.value}</p>
        </div>
      ))}
    </section>
  );
}

interface SummaryItem {
  label: string;
  value: string;
}

function buildSummaryItems(mission: Mission | null): SummaryItem[] {
  if (!mission) {
    return [
      { label: "Package Weight", value: "—" },
      { label: "Eligible Drones", value: "—" },
      { label: "Weather Risk", value: "—" },
      { label: "Airspace Auth", value: "—" },
    ];
  }

  const fleetStep = mission.steps.FLEET;
  const weatherStep = mission.steps.WEATHER;
  const airspaceStep = mission.steps.AIRSPACE;

  const eligibleValue =
    fleetStep.status === "Waiting" || !mission.fleetEligibility
      ? "—"
      : `${mission.fleetEligibility.filter((row) => row.eligible).length}/${mission.fleetEligibility.length}`;

  const weatherValue =
    weatherStep.status === "Waiting" ? "—" : weatherStep.status === "Warning" ? "Elevated" : weatherStep.status === "Failed" ? "High" : "Low";

  const airspaceValue =
    airspaceStep.status === "Waiting" || !mission.airspaceEval
      ? "—"
      : mission.airspaceEval.authorizationRequired
        ? "Required"
        : "Clear";

  return [
    { label: "Package Weight", value: `${mission.input.weightKg} kg` },
    { label: "Eligible Drones", value: eligibleValue },
    { label: "Weather Risk", value: weatherValue },
    { label: "Airspace Auth", value: airspaceValue },
  ];
}

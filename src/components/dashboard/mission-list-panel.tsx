"use client";

import { cn } from "@/lib/utils";
import type { Mission, MissionLifecycle } from "@/types/domain";

interface MissionListPanelProps {
  disablePresetCreation?: boolean;
  missions: Mission[];
  onCreatePreset: (pattern: Mission["pattern"]) => void;
  onSelectMission: (id: string) => void;
  selectedMissionId: string | null;
}

const lifecycleClasses: Record<MissionLifecycle, string> = {
  NEW: "bg-neutral-100 text-neutral-600",
  PREFLIGHT: "bg-blue-100 text-blue-700",
  HOLD: "bg-amber-100 text-amber-700",
  READY: "bg-emerald-100 text-emerald-700",
  LAUNCHED: "bg-black text-white",
  IN_FLIGHT: "bg-black text-white",
  RETURNING_HOME: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  ABORTED: "bg-red-100 text-red-700",
};

export function MissionListPanel({
  disablePresetCreation = false,
  missions,
  onCreatePreset,
  onSelectMission,
  selectedMissionId,
}: MissionListPanelProps) {
  return (
    <aside className="flex h-auto max-h-56 min-h-0 w-full flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-3 lg:h-full lg:max-h-none">
      <div className="grid grid-cols-2 gap-2">
        <PresetButton disabled={disablePresetCreation} onClick={() => onCreatePreset("MISSION_1")}>Order 1</PresetButton>
        <PresetButton disabled={disablePresetCreation} onClick={() => onCreatePreset("MISSION_2")}>Order 2</PresetButton>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {missions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs font-medium text-neutral-400">No missions yet</p>
        ) : (
          missions.map((mission) => {
            const isSelected = mission.id === selectedMissionId;
            return (
              <button
                key={mission.id}
                type="button"
                onClick={() => onSelectMission(mission.id)}
                className={cn(
                  "block w-full rounded-xl border p-3 text-left transition",
                  isSelected ? "border-black bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-300",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-geist text-sm font-semibold tracking-[-0.02em] text-black">{mission.label}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]",
                      lifecycleClasses[mission.lifecycle],
                    )}
                  >
                    {mission.lifecycle}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-neutral-500">
                  {mission.input.deliveryType} · {mission.input.weightKg} kg
                </p>
                {mission.confirmedDrone ? (
                  <p className="mt-1 truncate text-[11px] font-semibold text-neutral-700">Drone: {mission.confirmedDrone}</p>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function PresetButton({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-bold text-neutral-700 transition hover:border-black hover:bg-white hover:text-black",
        disabled && "cursor-not-allowed opacity-50 hover:border-neutral-200 hover:bg-neutral-50 hover:text-neutral-700",
      )}
    >
      {children}
    </button>
  );
}

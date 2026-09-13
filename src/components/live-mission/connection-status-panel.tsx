"use client";

import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/types/domain";

interface ConnectionStatusPanelProps {
  connectionState: ConnectionState;
  onToggleConnection: () => void;
}

export function ConnectionStatusPanel({ connectionState, onToggleConnection }: ConnectionStatusPanelProps) {
  const isOffline = connectionState === "offline";

  return (
    <div
      className={cn(
        "shrink-0 rounded-[22px] border p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]",
        isOffline ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isOffline ? <WifiOff className="h-3.5 w-3.5 text-red-600" /> : <Wifi className="h-3.5 w-3.5 text-emerald-600" />}
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-600">
            {isOffline ? "Connection lost" : "Connection nominal"}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleConnection}
          className="shrink-0 rounded-full border border-neutral-300 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-neutral-600 transition hover:border-black hover:text-black"
        >
          {isOffline ? "Restore" : "Simulate loss"}
        </button>
      </div>

      {!isOffline ? (
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">
          Approved mission plan and active hazard snapshot synchronized.
        </p>
      ) : (
        <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-red-800">
          <p>
            <span className="font-bold uppercase tracking-[0.06em]">Input:</span> Network connection unavailable.
          </p>
          <p>
            <span className="font-bold uppercase tracking-[0.06em]">Evaluation:</span> Cached approved mission plan available.
            Local simulation sensors remain healthy.
          </p>
          <p className="font-semibold">
            <span className="font-bold uppercase tracking-[0.06em]">Decision:</span> Continue only within the approved cached
            corridor.
          </p>
        </div>
      )}
    </div>
  );
}

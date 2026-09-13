"use client";

import { cn } from "@/lib/utils";
import type { OperationalMemory } from "@/types/domain";

interface MemoryCapturePanelProps {
  memory: OperationalMemory;
}

export function MemoryCapturePanel({ memory }: MemoryCapturePanelProps) {
  return (
    <div className="min-h-0 rounded-[22px] border border-red-200 bg-red-50/60 p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Memory Capture</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
            memory.airtableStatus === "saved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
          )}
        >
          Airtable {memory.airtableStatus === "saved" ? "saved" : "saving..."}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-[10px] leading-tight text-neutral-700">
        <Field label="Hazard" value={memory.hazardType} />
        <Field label="Coordinates" value="37.7927, -122.3967" />
        <Field label="Altitude band" value={`${memory.altitudeBandM[0]}-${memory.altitudeBandM[1]}m`} />
        <Field label="Avoid radius" value={`${memory.avoidanceRadiusM}m`} />
        <Field label="Confidence" value={`${Math.round(memory.confidence * 100)}%`} />
        <Field label="Source" value={memory.learnedBy} />
        <Field label="Expires" value={formatShortTimestamp(memory.expiresAt)} />
        <Field label="Record ID" value={memory.id} />
      </div>

      <div
        className={cn(
          "mt-2.5 rounded-[16px] p-2.5 text-center text-[11px] font-semibold leading-tight",
          memory.usedBy ? "bg-black text-white" : "bg-white text-neutral-500",
        )}
      >
        {memory.usedBy
          ? `${memory.learnedBy} discovered the hazard → ${memory.usedBy} inherited the intelligence`
          : `${memory.learnedBy} discovered the hazard → awaiting cross-vendor reuse`}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold uppercase tracking-[0.08em] text-neutral-400">{label}</p>
      <p className="text-black">{value}</p>
    </div>
  );
}

function formatShortTimestamp(value: string) {
  return value.replace("T", " ").replace(".000Z", " UTC").slice(5, 16);
}

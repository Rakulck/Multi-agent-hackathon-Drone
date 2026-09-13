"use client";

import { cn } from "@/lib/utils";
import type { StepStatus } from "@/types/domain";

const statusBadgeClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-100 text-neutral-500",
  Evaluating: "bg-blue-100 text-blue-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Warning: "bg-amber-100 text-amber-700",
  Failed: "bg-red-100 text-red-700",
};

interface AgentDecisionPanelProps {
  decision: string;
  evaluation: string;
  input: string;
  source: string[];
  status: StepStatus;
}

export function AgentDecisionPanel({ decision, evaluation, input, source, status }: AgentDecisionPanelProps) {
  return (
    <div className="shrink-0 rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Live Evaluation</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]", statusBadgeClasses[status])}>
          {status}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <LiveField label="Input" value={input} />
        <LiveField label="Evaluation" value={evaluation} />
        <div className="rounded-xl bg-black p-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">Decision</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-white">{decision}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-400">Source</span>
        {source.map((item) => (
          <span key={item} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-bold text-neutral-600">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function LiveField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-400">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-neutral-700">{value}</p>
    </div>
  );
}

"use client";

import { ArrowRight, Check, ChevronRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StepEvidence, StepStatus } from "@/types/domain";

const statusBadgeClasses: Record<StepStatus, string> = {
  Waiting: "bg-neutral-100 text-neutral-500",
  Evaluating: "bg-blue-100 text-blue-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Warning: "bg-amber-100 text-amber-700",
  Failed: "bg-red-100 text-red-700",
  Approval: "bg-violet-100 text-violet-700",
};

export function StepEvidenceCard({
  canAdvance = false,
  controls,
  isAdvancing = false,
  onNext,
  showAdvance = false,
  step,
}: {
  canAdvance?: boolean;
  controls?: ReactNode;
  isAdvancing?: boolean;
  onNext?: () => void;
  showAdvance?: boolean;
  step: StepEvidence;
}) {
  const showNext =
    Boolean(onNext) && (showAdvance || canAdvance || isAdvancing);
  const decisionIsUnsafe =
    step.status === "Failed" ||
    step.decision.toLowerCase().includes("not suitable") ||
    step.decision.toLowerCase().includes("unsafe");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_14px_40px_rgba(0,0,0,0.07)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-geist text-base font-semibold tracking-[-0.02em] text-black">{step.title}</h3>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]", statusBadgeClasses[step.status])}>
            {step.status === "Evaluating" ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Evaluating
              </span>
            ) : (
              step.status
            )}
          </span>
        </div>

        {controls ? <div className="mt-3">{controls}</div> : null}

        <div className="mt-3 grid gap-2.5">
          <EvidenceBlock label="Input" items={step.input} />
          <EvidenceBlock label="Evaluation" items={step.evaluation} />
          <div
            className={cn(
              "rounded-2xl p-3",
              decisionIsUnsafe ? "bg-red-600" : "bg-black",
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Decision</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-white">{step.decision || "Pending evaluation."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">Source</span>
            {step.source.length === 0 ? (
              <span className="text-[11px] font-medium text-neutral-400">Pending</span>
            ) : (
              step.source.map((source) => (
                <span key={source} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-700">
                  {source}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {showNext ? (
        <div className="shrink-0 border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            disabled={!canAdvance}
            onClick={onNext}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] transition",
              canAdvance
                ? "border-black bg-black text-white hover:bg-neutral-800"
                : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400",
            )}
          >
            {isAdvancing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Evaluating
              </>
            ) : (
              <>
                Next Step
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceBlock({ items, label }: { items: string[]; label: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] font-medium text-neutral-400">Pending evaluation.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[11px] leading-snug text-neutral-700">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StepHistoryRow({ step }: { step: StepEvidence }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2">
      <ChevronRight className="h-3 w-3 shrink-0 text-neutral-400" />
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">{step.title}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase", statusBadgeClasses[step.status])}>
        {step.status}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-700">{step.summary}</span>
    </div>
  );
}

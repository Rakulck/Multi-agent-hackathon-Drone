"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalDecision, ApprovalRequest } from "@/types/domain";

interface HumanInLoopPanelProps {
  approval: ApprovalRequest | null;
  isRunning: boolean;
  onResolveApproval: (decision: ApprovalDecision) => void;
  onSimulateApproval: () => void;
  slackNotified: boolean;
}

export function HumanInLoopPanel({
  approval,
  isRunning,
  onResolveApproval,
  onSimulateApproval,
  slackNotified,
}: HumanInLoopPanelProps) {
  if (!approval) {
    return (
      <div className="shrink-0 rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold text-neutral-700">
              Autonomous — deterministic decisions require no approval
            </p>
          </div>
          <button
            type="button"
            disabled={isRunning}
            onClick={onSimulateApproval}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition",
              isRunning
                ? "cursor-not-allowed border-neutral-200 text-neutral-300"
                : "border-neutral-300 text-neutral-600 hover:border-black hover:text-black",
            )}
          >
            Simulate uncertain event
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-[22px] border border-amber-300 bg-amber-50 p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-800">Human approval required</p>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-amber-900">{approval.category}</p>
      <p className="mt-1 text-[11px] leading-snug text-amber-800">{approval.reason}</p>
      <p className="mt-1 text-[11px] font-semibold leading-snug text-black">
        Recommended: {approval.recommendedAction}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
        {slackNotified ? "Sent to Slack ✓" : "Notifying Slack..."}
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <ApprovalButton onClick={() => onResolveApproval("approve-reroute")}>Approve Reroute</ApprovalButton>
        <ApprovalButton onClick={() => onResolveApproval("return-home")}>Return Home</ApprovalButton>
        <ApprovalButton onClick={() => onResolveApproval("cancel-mission")} isDanger>
          Cancel Mission
        </ApprovalButton>
      </div>
    </div>
  );
}

function ApprovalButton({
  children,
  isDanger = false,
  onClick,
}: {
  children: string;
  isDanger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.05em] transition",
        isDanger
          ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
          : "border-black bg-black text-white hover:bg-neutral-800",
      )}
    >
      {children}
    </button>
  );
}

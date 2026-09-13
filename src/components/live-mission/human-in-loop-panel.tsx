"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalDecision, ApprovalRequest } from "@/types/domain";

interface HumanInLoopPanelProps {
  approval: ApprovalRequest | null;
  isRunning: boolean;
  onResolveApproval: (decision: ApprovalDecision) => void;
  onSimulateApproval: () => void;
}

export function HumanInLoopPanel({
  approval,
  isRunning,
  onResolveApproval,
  onSimulateApproval,
}: HumanInLoopPanelProps) {
  if (!approval) {
    return (
      <div className="shrink-0 rounded-2xl border border-neutral-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold text-neutral-700">No approval needed</p>
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
            Simulate low-confidence event
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <p className="text-xs font-bold text-amber-900">Slack approval</p>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
          {approvalStatusLabel(approval)}
        </p>
      </div>
      <p className="mt-2 text-sm leading-snug text-amber-950">
        <span className="font-bold">Why:</span> {approval.reason}
      </p>
      <p className="mt-1 text-sm leading-snug text-black">
        <span className="font-bold">Recommended:</span> {approval.recommendedAction}
      </p>
      {approval.transport === "DEMO_FALLBACK" && isActionable(approval) ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <ApprovalButton onClick={() => onResolveApproval("approve")}>
              {approval.approvalKind === "LIVE_OBSTACLE_REROUTE" ? "Adjust Altitude" : "Approve Adjustment"}
            </ApprovalButton>
            <ApprovalButton onClick={() => onResolveApproval("hold")}>
              {approval.approvalKind === "LIVE_OBSTACLE_REROUTE" ? "Keep Holding" : "Keep Hold"}
            </ApprovalButton>
            <ApprovalButton onClick={() => onResolveApproval("reject")} isDanger>
              {approval.approvalKind === "LIVE_OBSTACLE_REROUTE" ? "Return Home" : "Reject Mission"}
            </ApprovalButton>
          </div>
        </>
      ) : null}
    </div>
  );
}

function isActionable(approval: ApprovalRequest) {
  return ["SLACK_UNAVAILABLE", "SLACK_API_FAILED"].includes(approval.status);
}

function approvalStatusLabel(approval: ApprovalRequest) {
  switch (approval.status) {
    case "SENDING":
      return "Sending to Slack…";
    case "PENDING":
      return "Sent to Slack ✓ · waiting for operator";
    case "APPROVED":
      return `Approved${approval.operatorName ? ` by ${approval.operatorName}` : ""}`;
    case "HELD":
      return `Awaiting operator decision${approval.operatorName ? ` · held by ${approval.operatorName}` : ""}`;
    case "REJECTED":
      return `Mission rejected${approval.operatorName ? ` by ${approval.operatorName}` : ""}`;
    case "TIMED_OUT":
      return "Slack approval timed out · still paused";
    case "SLACK_UNAVAILABLE":
      return "Slack unavailable · DEMO_FALLBACK enabled";
    case "SLACK_API_FAILED":
      return "Slack API failed · DEMO_FALLBACK enabled";
    case "SLACK_UPDATE_FAILED":
      return "Decision recorded · Slack message update failed";
  }
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

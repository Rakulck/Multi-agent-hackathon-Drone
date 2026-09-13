"use client";

import { useEffect, useMemo, useRef } from "react";
import { Bot, MessageCircle, Radio, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ConnectionState,
  CustomerCommunicationSnapshot,
  IntegrationEvent,
  OperationalMemory,
} from "@/types/domain";

interface MissionActivityLogProps {
  approval: ApprovalRequest | null;
  communication: CustomerCommunicationSnapshot | null;
  connectionState: ConnectionState;
  currentDecision: string;
  events: IntegrationEvent[];
  memory: OperationalMemory | null;
  onResolveApproval: (decision: ApprovalDecision) => void;
}

interface ActivityItem {
  actor: string;
  detail: string;
  id: string;
  time?: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

export function MissionActivityLog({
  approval,
  communication,
  connectionState,
  currentDecision,
  events,
  memory,
  onResolveApproval,
}: MissionActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const items = useMemo(
    () => buildActivityItems(events, communication, memory),
    [communication, events, memory],
  );

  useEffect(() => {
    if (pinnedToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [approval, currentDecision, items.length]);

  return (
    <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-[22px] border border-neutral-200 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <header className="shrink-0 border-b border-neutral-100 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-neutral-500" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
              Mission Activity
            </p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]",
              connectionState === "online"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-800",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connectionState === "online" ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {connectionState === "online" ? "Live" : "Cached plan"}
          </span>
        </div>
        <p className="mt-2 truncate rounded-xl bg-neutral-950 px-3 py-2 text-[11px] font-semibold text-white" title={currentDecision}>
          Safety decision · {currentDecision}
        </p>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          const target = event.currentTarget;
          pinnedToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight < 36;
        }}
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-[11px] font-medium text-neutral-400">
            Mission events will appear here.
          </p>
        ) : (
          items.map((item) => <ActivityBubble item={item} key={item.id} />)
        )}

        {approval ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900">
                <Radio className="h-3.5 w-3.5" />
                Slack operator
              </span>
              <span className="text-[9px] font-bold uppercase text-amber-700">
                {approvalStateLabel(approval)}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-semibold leading-snug text-amber-950">
              {approvalReason(approval)}
            </p>
            {isLocallyActionable(approval) ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <ActionButton onClick={() => onResolveApproval("approve")}>Approve</ActionButton>
                <ActionButton onClick={() => onResolveApproval("hold")}>Hold</ActionButton>
                <ActionButton danger onClick={() => onResolveApproval("reject")}>Return</ActionButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActivityBubble({ item }: { item: ActivityItem }) {
  const Icon =
    item.actor === "Slack"
      ? Radio
      : item.actor === "Customer"
        ? UserRound
        : item.actor.includes("Safety") || item.actor === "Airtable"
          ? ShieldCheck
          : Bot;

  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          item.tone === "success" && "bg-emerald-100 text-emerald-700",
          item.tone === "warning" && "bg-amber-100 text-amber-800",
          item.tone === "danger" && "bg-red-100 text-red-700",
          item.tone === "neutral" && "bg-neutral-100 text-neutral-600",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-neutral-50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold text-neutral-800">{item.actor}</span>
          {item.time ? <span className="shrink-0 text-[9px] font-medium text-neutral-400">{formatTime(item.time)}</span> : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{item.detail}</p>
      </div>
    </div>
  );
}

function buildActivityItems(
  events: IntegrationEvent[],
  communication: CustomerCommunicationSnapshot | null,
  memory: OperationalMemory | null,
): ActivityItem[] {
  const integrationItems = events.map<ActivityItem>((event) => ({
    actor: event.app,
    detail: safeIntegrationDetail(event),
    id: `integration-${event.id}`,
    time: event.timestamp,
    tone:
      event.status === "Failed"
        ? "warning"
        : event.status === "Completed"
          ? "success"
          : event.status === "Processing"
            ? "warning"
            : "neutral",
  }));

  const customerItems = (communication?.events ?? []).map<ActivityItem>((event, index) => ({
    actor: "Customer",
    detail: customerEventDetail(event.eventType, event.status),
    id: `customer-${event.messageSid ?? index}-${event.timestamp}`,
    time: event.timestamp,
    tone: event.status === "delivered" || event.status === "sent" ? "success" : "warning",
  }));

  const memoryItem: ActivityItem[] =
    memory?.airtableStatus === "saved"
      ? [{
          actor: "Airtable",
          detail: memory.usedBy
            ? `Verified crane memory reused by ${memory.usedBy}; Route A rejected and Route B selected before takeoff.`
            : "Verified crane memory saved and shared with the fleet.",
          id: `memory-${memory.id}`,
          time: memory.verifiedAt ?? memory.createdAt,
          tone: "success",
        }]
      : [];

  return [...integrationItems, ...customerItems, ...memoryItem].sort(
    (left, right) => sortableTime(left.time) - sortableTime(right.time),
  );
}

function safeIntegrationDetail(event: IntegrationEvent): string {
  if (
    event.app === "Twilio" &&
    /(fail|not sent|not delivered|could not|fallback)/i.test(event.result)
  ) {
    return "Customer communication moved to the operator-assisted path.";
  }
  if (/(sms|twilio).*(fail|not sent|not delivered|could not)/i.test(event.result)) {
    return "Operator-assisted customer decision requested.";
  }
  return event.result.replaceAll("DEMO_FALLBACK", "operator-assisted mode");
}

function customerEventDetail(
  eventType: string,
  status: string,
): string {
  if (status === "failed") {
    return eventType === "ALTERNATE_DROPOFF_REQUIRED"
      ? "Alternate drop-off decision moved to operator review."
      : "Customer update continued through the operator-assisted path.";
  }
  const labels: Record<string, string> = {
    DISPATCHED_TO_PICKUP: "Dispatch update sent.",
    PACKAGE_PICKED_UP: "Package pickup update sent.",
    APPROACHING_DESTINATION: "Approach update sent.",
    ALTERNATE_DROPOFF_REQUIRED: "Alternate drop-off decision requested.",
    DELIVERED: "Delivery confirmation sent.",
  };
  return labels[eventType] ?? "Customer update recorded.";
}

function approvalReason(approval: ApprovalRequest): string {
  if (approval.approvalKind === "LIVE_OBSTACLE_REROUTE") {
    return "Crane conflict confirmed. Choose the approved altitude adjustment, hold, or return home.";
  }
  if (approval.category === "Blocked drop-off zone") {
    return "Drop-off unavailable. Review the deterministic-safe alternate location.";
  }
  return `Safety review required: ${approval.recommendedAction}`;
}

function approvalStateLabel(approval: ApprovalRequest): string {
  if (approval.status === "APPROVED") return "Approved";
  if (approval.status === "REJECTED") return "Rejected";
  if (approval.status === "HELD" || approval.status === "TIMED_OUT") return "Holding";
  return "Awaiting decision";
}

function isLocallyActionable(approval: ApprovalRequest): boolean {
  return ["SLACK_UNAVAILABLE", "SLACK_API_FAILED"].includes(approval.status);
}

function sortableTime(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const parts = value.split(":").map(Number);
  return parts.length >= 2
    ? parts[0] * 3_600_000 + parts[1] * 60_000 + (parts[2] ?? 0) * 1_000
    : Number.MAX_SAFE_INTEGER;
}

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return value;
}

function ActionButton({
  children,
  danger = false,
  onClick,
}: {
  children: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-2 py-2 text-[10px] font-bold uppercase transition",
        danger
          ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
          : "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700",
      )}
    >
      {children}
    </button>
  );
}

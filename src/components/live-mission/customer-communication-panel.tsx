"use client";

import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerCommunicationSnapshot } from "@/types/domain";

export function CustomerCommunicationPanel({
  communication,
}: {
  communication: CustomerCommunicationSnapshot | null;
}) {
  const latest = communication?.events.at(-1) ?? null;
  return (
    <div className="rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-3.5 w-3.5 text-neutral-500" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            Customer Communication
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]",
            communication?.transport === "TWILIO"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700",
          )}
        >
          {communication?.transport ?? "DEMO_FALLBACK"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        <CommunicationField
          label="Message event"
          value={latest?.eventType.replaceAll("_", " ") ?? "Waiting"}
        />
        <CommunicationField
          label="Recipient"
          value={communication?.recipientMasked ?? "Unavailable"}
        />
        <CommunicationField
          label="Twilio status"
          value={latest?.status ?? "Not sent"}
          tone={latest?.status === "failed" ? "danger" : "default"}
        />
        <CommunicationField
          label="Customer choice"
          value={
            communication?.waitingForReply
              ? "Waiting for secure confirmation"
              : communication?.replyReceived
                ? communication.selectedAlternative ?? "Received"
                : "Not requested"
          }
        />
        <CommunicationField
          label="Safety decision"
          value={communication?.safetyValidation ?? "Pending"}
          tone={
            communication?.safetyValidation === "UNSAFE"
              ? "danger"
              : communication?.safetyValidation === "SAFE"
                ? "success"
                : "default"
          }
        />
        <CommunicationField
          label="Updated drop-off"
          value={communication?.updatedDropOff ?? "Unchanged"}
        />
      </div>
      {communication?.operatorReviewRequested ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">
          Operator review requested; drone remains in HOLD.
        </p>
      ) : null}
    </div>
  );
}

function CommunicationField({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "success" | "danger";
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </p>
      <p
        className={cn(
          "truncate font-bold capitalize text-neutral-700",
          tone === "success" && "text-emerald-700",
          tone === "danger" && "text-red-700",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

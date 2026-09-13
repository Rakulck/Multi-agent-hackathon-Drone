"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CustomerCommunicationTransport,
  CustomerMessageEventType,
} from "@/types/domain";

export type TwilioToastStatus = "sending" | "sent" | "failed";

export interface TwilioToastItem {
  id: string;
  missionId: string;
  eventType: CustomerMessageEventType;
  message: string;
  recipientMasked: string;
  status: TwilioToastStatus;
  transport: CustomerCommunicationTransport;
}

export function TwilioToastViewport({
  onDismiss,
  toast,
}: {
  onDismiss: (id: string) => void;
  toast: TwilioToastItem | null;
}) {
  if (!toast) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-5 top-5 z-[80] w-[min(360px,calc(100vw-2rem))]"
    >
      <TwilioToastCard
        key={toast.id}
        toast={toast}
        onDismiss={onDismiss}
      />
    </div>
  );
}

function TwilioToastCard({
  onDismiss,
  toast,
}: {
  onDismiss: (id: string) => void;
  toast: TwilioToastItem;
}) {
  const [exiting, setExiting] = useState(false);
  const isFallback = toast.transport === "DEMO_FALLBACK";

  useEffect(() => {
    if (toast.status === "sending") return;
    const visibleForMs =
      toast.status === "failed" && !isFallback ? 4_000 : 2_000;
    const exitTimer = window.setTimeout(() => setExiting(true), visibleForMs);
    const removeTimer = window.setTimeout(
      () => onDismiss(toast.id),
      visibleForMs + 280,
    );
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, [isFallback, onDismiss, toast]);

  return (
    <div
      className={cn(
        "twilio-toast-enter rounded-[20px] border bg-white p-4 shadow-[0_22px_60px_rgba(0,0,0,0.22)] transition-all duration-300 ease-out",
        isFallback ? "border-amber-300" : "border-neutral-200",
        exiting && "translate-x-4 scale-[0.98] opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <TwilioMark fallback={isFallback} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-black">Customer Update</p>
              <p
                className={cn(
                  "mt-0.5 text-[9px] font-bold uppercase tracking-[0.13em]",
                  isFallback ? "text-amber-700" : "text-[#e31c5f]",
                )}
              >
                {isFallback ? "TWILIO DEMO · SIMULATED SMS" : "Twilio"}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-neutral-400">
              {toast.recipientMasked}
            </span>
          </div>

          <p className="mt-2 text-[12px] font-medium leading-relaxed text-neutral-700">
            “{toast.message}”
          </p>

          <ToastStatus status={toast.status} fallback={isFallback} />
        </div>
      </div>
    </div>
  );
}

function TwilioMark({ fallback }: { fallback: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-8 w-8 shrink-0 grid-cols-2 place-items-center gap-0.5 rounded-full p-2",
        fallback ? "bg-amber-100" : "bg-[#e31c5f]",
      )}
    >
      {[0, 1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={cn(
            "h-1.5 w-1.5 rounded-full border",
            fallback ? "border-amber-700" : "border-white",
          )}
        />
      ))}
    </span>
  );
}

function ToastStatus({
  fallback,
  status,
}: {
  fallback: boolean;
  status: TwilioToastStatus;
}) {
  if (status === "sending") {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sending
      </p>
    );
  }
  if (fallback) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
        <Check className="h-3 w-3" />
        Sent ✓
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600">
        <AlertCircle className="h-3 w-3" />
        Failed
      </p>
    );
  }
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
      <Check className="h-3 w-3" />
      Sent ✓
    </p>
  );
}

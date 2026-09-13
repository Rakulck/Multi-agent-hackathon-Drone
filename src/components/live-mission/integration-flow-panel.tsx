"use client";

import { Bot, Camera, Database, MessageSquareText, Radio, ShieldCheck, Sparkles, UserCheck, UserRound, Wind, type LucideIcon } from "lucide-react";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationApp, IntegrationEvent, IntegrationStatus } from "@/types/domain";

const appIcons: Record<IntegrationApp, LucideIcon> = {
  "Drone Sensor": Camera,
  OpenWeather: Wind,
  "Mission Agent": Bot,
  Twilio: MessageSquareText,
  Customer: UserRound,
  "Gemini 2.5 Flash": Sparkles,
  "Deterministic Safety Engine": ShieldCheck,
  Airtable: Database,
  "Route Updated": MapIcon,
  "Google Maps 3D": MapIcon,
  Slack: Radio,
  Operator: UserCheck,
};

const statusClasses: Record<IntegrationStatus, string> = {
  Waiting: "bg-neutral-100 text-neutral-500",
  Processing: "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Failed: "bg-red-100 text-red-700",
};

interface IntegrationFlowPanelProps {
  events: IntegrationEvent[];
}

export function IntegrationFlowPanel({ events }: IntegrationFlowPanelProps) {
  return (
    <div className="min-h-0 rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Integration Flow</p>
      <p className="mt-1 text-[9px] font-semibold leading-snug text-neutral-500">
        Agent → Twilio update → Customer web choice → Safety validation → Destination updated
      </p>

      {events.length === 0 ? (
        <p className="mt-2 text-[11px] font-medium text-neutral-400">No integration activity yet.</p>
      ) : (
        <div className="mt-2">
          {events.map((event, index) => {
            const Icon = appIcons[event.app];
            const isActive = event.status === "Processing";
            const isLast = index === events.length - 1;

            return (
              <div key={event.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition",
                      isActive ? "bg-black text-white ring-4 ring-neutral-200" : "bg-neutral-100 text-neutral-500",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!isLast ? <span className="my-0.5 w-px flex-1 bg-neutral-200" /> : null}
                </div>
                <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-2.5")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs font-bold", isActive ? "text-black" : "text-neutral-600")}>
                      {event.app}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
                          statusClasses[event.status],
                        )}
                      >
                        {event.status}
                      </span>
                      <span className="text-[9px] font-semibold text-neutral-400">{event.timestamp}</span>
                    </div>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-neutral-600">{event.result}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { Eye, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GeminiObstacleApiResponse,
  VisionAnalysisPhase,
} from "@/types/domain";

interface DroneVisionPanelProps {
  analysis: GeminiObstacleApiResponse | null;
  phase: VisionAnalysisPhase;
}

export function DroneVisionPanel({
  analysis,
  phase,
}: DroneVisionPanelProps) {
  const observation = analysis?.observation ?? null;
  const isAnalyzing = phase === "ANALYZING";

  return (
    <div className="rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-neutral-600" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            Drone Vision
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]",
            analysis?.source === "GEMINI"
              ? "bg-violet-100 text-violet-700"
              : analysis?.source === "DEMO_FALLBACK"
                ? "bg-amber-100 text-amber-700"
                : phase === "FAILED"
                  ? "bg-red-100 text-red-700"
                  : "bg-neutral-100 text-neutral-500",
          )}
        >
          {analysis?.source === "GEMINI"
            ? "Gemini 2.5 Flash"
            : analysis?.source === "DEMO_FALLBACK"
              ? "DEMO_FALLBACK · not Gemini"
              : phase === "FAILED"
                ? "GEMINI_API_FAILURE"
                : isAnalyzing
                  ? "Analyzing with Gemini"
                  : "Camera ready"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-[112px_1fr] gap-3">
        <div className="relative h-[86px] overflow-hidden rounded-2xl bg-neutral-100">
          <Image
            src="/demo/construction-crane.jpg"
            alt="Bundled simulated drone-camera view of a construction crane"
            fill
            sizes="112px"
            className="object-cover"
            priority
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-white">
            Simulated camera
          </span>
          {isAnalyzing ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </span>
          ) : null}
        </div>

        <div className="min-w-0 space-y-1.5 text-[10px] leading-tight">
          <VisionRow
            label="Gemini 2.5 Flash observation"
            value={
              isAnalyzing
                ? "Analyzing image…"
                : observation
                  ? observation.obstacleDetected
                    ? `${observation.obstacleType.replaceAll("_", " ")} · ${Math.round(observation.confidence * 100)}%`
                    : `No obstacle · ${Math.round(observation.confidence * 100)}%`
                  : analysis?.message ?? "Waiting for Atlas to reach the vision waypoint."
            }
          />
          <VisionRow
            label="Altitude overlap"
            value={
              analysis
                ? analysis.decision.altitudeOverlap
                  ? "Yes · active corridor"
                  : "No"
                : "Pending"
            }
          />
          <VisionRow
            label="Deterministic safety decision"
            value={analysis?.decision.action.replaceAll("_", " ") ?? "Pending"}
            strong
          />
          <VisionRow
            label="Airtable save"
            value={
              analysis?.source === "DEMO_FALLBACK"
                ? `Not Airtable · ${analysis.memorySaveStatus.replaceAll("_", " ")}`
                : analysis?.memorySaveStatus.replaceAll("_", " ") ??
                  "Not started"
            }
          />
        </div>
      </div>

      {observation?.description ? (
        <p className="mt-2 line-clamp-2 text-[10px] leading-snug text-neutral-500">
          {observation.description}
        </p>
      ) : null}
      <p className="mt-1 text-[8px] text-neutral-400">
        Bundled demo frame · Wikimedia Commons / Alf van Beem
      </p>
    </div>
  );
}

function VisionRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="font-bold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </p>
      <p
        className={cn(
          "truncate text-neutral-700",
          strong && "font-bold text-black",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

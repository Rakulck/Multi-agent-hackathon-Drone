"use client";

import { useState } from "react";
import type { CameraState } from "@/types/map";

interface MapCalibrationPanelProps {
  cameraState: CameraState | null;
}

/** Dev-only panel, shown only when `?debugMap=1` is present. Never renders secrets. */
export function MapCalibrationPanel({ cameraState }: MapCalibrationPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!cameraState) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(cameraState, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pointer-events-auto absolute bottom-24 right-4 w-56 rounded-2xl border border-amber-300 bg-amber-50/95 p-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]">Map Calibration</p>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 normal-case tracking-normal">
        <dt className="text-amber-600">Lat</dt>
        <dd>{cameraState ? cameraState.lat.toFixed(5) : "—"}</dd>
        <dt className="text-amber-600">Lng</dt>
        <dd>{cameraState ? cameraState.lng.toFixed(5) : "—"}</dd>
        <dt className="text-amber-600">Alt (m)</dt>
        <dd>{cameraState ? Math.round(cameraState.altitudeM) : "—"}</dd>
        <dt className="text-amber-600">Heading</dt>
        <dd>{cameraState ? Math.round(cameraState.heading) : "—"}</dd>
        <dt className="text-amber-600">Tilt</dt>
        <dd>{cameraState ? Math.round(cameraState.tilt) : "—"}</dd>
        <dt className="text-amber-600">Range (m)</dt>
        <dd>{cameraState ? Math.round(cameraState.range) : "—"}</dd>
      </dl>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-2 w-full rounded-full border border-amber-400 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800 transition hover:bg-amber-100"
      >
        {copied ? "Copied" : "Copy camera config"}
      </button>
    </div>
  );
}

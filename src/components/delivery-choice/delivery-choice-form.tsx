"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Choice = "Terrace" | "Front Entrance";

export function DeliveryChoiceForm({
  currentStatus,
  missionId,
  secureToken,
}: {
  currentStatus: string;
  missionId: string;
  secureToken: string;
}) {
  const [selection, setSelection] = useState<Choice | null>(null);
  const [result, setResult] = useState<
    | { state: "IDLE" }
    | { state: "SUBMITTING" }
    | { state: "SAFE" | "UNSAFE" | "ERROR"; message: string }
  >({ state: "IDLE" });

  async function confirmSelection() {
    if (!selection || result.state === "SUBMITTING") return;
    setResult({ state: "SUBMITTING" });
    try {
      const response = await fetch(
        `/api/delivery-choice/${encodeURIComponent(secureToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection }),
          cache: "no-store",
        },
      );
      const data = (await response.json()) as {
        state?: string;
        message?: string;
      };
      if (response.ok && data.state === "SAFE") {
        setResult({
          state: "SAFE",
          message: "Drop-off updated. You may close this page.",
        });
        return;
      }
      if (response.ok && data.state === "UNSAFE") {
        setResult({
          state: "UNSAFE",
          message:
            data.message ??
            "This location could not be accepted. The drone remains holding.",
        });
        return;
      }
      setResult({
        state: "ERROR",
        message:
          data.message ??
          "This delivery choice could not be submitted.",
      });
    } catch {
      setResult({
        state: "ERROR",
        message:
          "The choice service could not be reached. Please try again.",
      });
    }
  }

  if (result.state === "SAFE") {
    return (
      <ChoiceShell>
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-black">
            Drop-off updated.
          </h1>
          <p className="mt-2 text-sm font-medium text-neutral-600">
            You may close this page.
          </p>
        </div>
      </ChoiceShell>
    );
  }

  return (
    <ChoiceShell>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
        Drone delivery
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-black">
        Choose a safe drop-off
      </h1>

      <dl className="mt-5 rounded-2xl bg-neutral-50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-neutral-500">Mission ID</dt>
          <dd className="max-w-[65%] truncate font-bold text-black">{missionId}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <dt className="font-medium text-neutral-500">Current status</dt>
          <dd className="text-right font-bold text-amber-700">{currentStatus}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-2">
        {(["Terrace", "Front Entrance"] as Choice[]).map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={selection === choice}
            onClick={() => setSelection(choice)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition",
              selection === choice
                ? "border-black bg-black text-white"
                : "border-neutral-200 bg-white text-black hover:border-neutral-400",
            )}
          >
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="font-bold">{choice}</span>
          </button>
        ))}
      </div>

      {result.state === "UNSAFE" || result.state === "ERROR" ? (
        <p
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-xs font-semibold",
            result.state === "UNSAFE"
              ? "bg-amber-50 text-amber-800"
              : "bg-red-50 text-red-700",
          )}
        >
          {result.message}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!selection || result.state === "SUBMITTING"}
        onClick={() => void confirmSelection()}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {result.state === "SUBMITTING" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming…
          </>
        ) : (
          "Confirm selection"
        )}
      </button>
      <p className="mt-3 text-center text-[11px] font-medium leading-relaxed text-neutral-500">
        Your preference is accepted only after deterministic flight-safety checks.
      </p>
    </ChoiceShell>
  );
}

export function DeliveryChoiceUnavailable({
  message,
}: {
  message: string;
}) {
  return (
    <ChoiceShell>
      <div className="py-8 text-center">
        <h1 className="text-xl font-bold text-black">Choice unavailable</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-600">
          {message}
        </p>
      </div>
    </ChoiceShell>
  );
}

function ChoiceShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <section className="w-full max-w-sm rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        {children}
      </section>
    </main>
  );
}

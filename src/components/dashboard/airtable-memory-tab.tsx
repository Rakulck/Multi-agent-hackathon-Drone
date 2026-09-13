"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import type { MemoryApiResponse, OperationalMemory } from "@/types/domain";

type LoadState = "loading" | "ready" | "error";

export function AirtableMemoryTab({ active }: { active: boolean }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [memories, setMemories] = useState<OperationalMemory[]>([]);
  const [message, setMessage] = useState("Loading Airtable memories…");

  const loadMemories = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await fetchMemories();
      setMemories(data.memories);
      setMessage(data.message);
      setLoadState("ready");
    } catch (error) {
      setMemories([]);
      setMessage(error instanceof Error ? error.message : "Airtable data could not be loaded.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void fetchMemories()
      .then((data) => {
        if (cancelled) return;
        setMemories(data.memories);
        setMessage(data.message);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMemories([]);
        setMessage(error instanceof Error ? error.message : "Airtable data could not be loaded.");
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
            <Database className="h-4 w-4 text-neutral-600" />
          </span>
          <div>
            <h2 className="font-geist text-lg font-semibold tracking-[-0.03em] text-black">Airtable memories</h2>
            <p className="text-xs text-neutral-500">
              {loadState === "ready" ? `${memories.length} saved ${memories.length === 1 ? "record" : "records"}` : message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadMemories()}
          disabled={loadState === "loading"}
          aria-label="Refresh Airtable memories"
          title="Refresh"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:border-black hover:text-black disabled:cursor-wait disabled:opacity-50"
        >
          {loadState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {loadState === "loading" ? (
          <EmptyMessage>Reading saved memories…</EmptyMessage>
        ) : loadState === "error" ? (
          <EmptyMessage>{message}</EmptyMessage>
        ) : memories.length === 0 ? (
          <EmptyMessage>No saved memories yet.</EmptyMessage>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {memories.map((memory) => (
              <MemoryRecord key={memory.airtableRecordId ?? memory.id} memory={memory} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MemoryRecord({ memory }: { memory: OperationalMemory }) {
  return (
    <article className="rounded-2xl border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">{humanize(memory.hazardType)}</p>
          <p className="mt-0.5 text-xs font-medium text-neutral-500">
            Route {memory.routeId} · {memory.severity} risk · {Math.round(memory.confidence * 100)}% confidence
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-700">
          {memory.status}
        </span>
      </div>

      <p className="mt-3 text-sm leading-snug text-neutral-700">{memory.summary}</p>

      <div className="mt-3 border-t border-neutral-100 pt-3 text-[11px] leading-relaxed text-neutral-500">
        <p>Learned by {memory.learnedBy}</p>
        <p>Verified by {memory.verifiedBy ?? "operator"}</p>
        <p>Expires {formatDate(memory.expiresAt)}</p>
      </div>
    </article>
  );
}

function EmptyMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center text-sm font-medium text-neutral-400">
      {children}
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function fetchMemories(): Promise<MemoryApiResponse> {
  const response = await fetch("/api/memory", { cache: "no-store" });
  const data: unknown = await response.json();
  if (!response.ok || !isMemoryResponse(data)) {
    throw new Error(isMessageResponse(data) ? data.message : "Airtable data could not be loaded.");
  }
  return data;
}

function isMessageResponse(value: unknown): value is { message: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string");
}

function isMemoryResponse(value: unknown): value is MemoryApiResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<MemoryApiResponse>;
  return (
    typeof response.message === "string" &&
    Array.isArray(response.memories) &&
    response.memories.every(
      (memory) =>
        Boolean(memory) &&
        typeof memory.id === "string" &&
        typeof memory.hazardType === "string" &&
        typeof memory.routeId === "string" &&
        typeof memory.confidence === "number" &&
        typeof memory.summary === "string" &&
        typeof memory.expiresAt === "string",
    )
  );
}

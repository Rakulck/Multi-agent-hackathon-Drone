"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { geocodeAddress } from "@/lib/map/geocode";
import { cn } from "@/lib/utils";
import type { DeliveryType, DropOffPreference, GeoAddress, MissionPriority, NewMissionInput } from "@/types/domain";

type AddressLookupStatus = "idle" | "locating" | "found" | "not-found";

const deliveryTypes: DeliveryType[] = ["Grocery", "Medical", "Small Logistics"];
const priorities: MissionPriority[] = ["Standard", "Express", "Critical"];
const dropOffPreferences: DropOffPreference[] = ["Primary entrance", "Rooftop", "Courtyard"];

export const defaultNewMissionInput: NewMissionInput = {
  deliveryType: "Grocery",
  weightKg: 4.5,
  pickup: "Downtown Grocery Hub",
  drop: "Riverside Apartments",
  priority: "Express",
  dropOffPreference: "Courtyard",
};

interface NewMissionModalProps {
  onCancel: () => void;
  onCreate: (input: NewMissionInput) => void;
}

export function NewMissionModal({ onCancel, onCreate }: NewMissionModalProps) {
  const [form, setForm] = useState<NewMissionInput>(defaultNewMissionInput);
  const [pickupPlace, setPickupPlace] = useState<GeoAddress | null>(null);
  const [dropPlace, setDropPlace] = useState<GeoAddress | null>(null);
  const [pickupStatus, setPickupStatus] = useState<AddressLookupStatus>("idle");
  const [dropStatus, setDropStatus] = useState<AddressLookupStatus>("idle");
  const [isCreating, setIsCreating] = useState(false);

  async function resolveAddress(address: string): Promise<GeoAddress | null> {
    const result = await geocodeAddress(address);
    return result ? { label: result.formattedAddress, lat: result.lat, lng: result.lng } : null;
  }

  async function handlePickupBlur() {
    if (!form.pickup.trim()) {
      setPickupStatus("idle");
      return;
    }
    setPickupStatus("locating");
    const resolved = await resolveAddress(form.pickup);
    if (resolved) {
      setPickupPlace(resolved);
      setPickupStatus("found");
      setForm((current) => ({ ...current, pickup: resolved.label }));
    } else {
      setPickupPlace(null);
      setPickupStatus("not-found");
    }
  }

  async function handleDropBlur() {
    if (!form.drop.trim()) {
      setDropStatus("idle");
      return;
    }
    setDropStatus("locating");
    const resolved = await resolveAddress(form.drop);
    if (resolved) {
      setDropPlace(resolved);
      setDropStatus("found");
      setForm((current) => ({ ...current, drop: resolved.label }));
    } else {
      setDropPlace(null);
      setDropStatus("not-found");
    }
  }

  async function handleCreate() {
    if (isCreating) {
      return;
    }
    setIsCreating(true);

    let resolvedPickup = pickupPlace;
    let resolvedDrop = dropPlace;

    if (!resolvedPickup && form.pickup.trim()) {
      setPickupStatus("locating");
      resolvedPickup = await resolveAddress(form.pickup);
      setPickupStatus(resolvedPickup ? "found" : "not-found");
    }
    if (!resolvedDrop && form.drop.trim()) {
      setDropStatus("locating");
      resolvedDrop = await resolveAddress(form.drop);
      setDropStatus(resolvedDrop ? "found" : "not-found");
    }

    setIsCreating(false);
    onCreate({ ...form, pickupPlace: resolvedPickup ?? undefined, dropPlace: resolvedDrop ?? undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">New Mission</p>
            <h2 className="font-geist mt-1 text-lg font-semibold tracking-[-0.03em] text-black">Create Mission</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Delivery type">
            <SegmentedControl
              options={deliveryTypes}
              value={form.deliveryType}
              onChange={(deliveryType) => setForm((current) => ({ ...current, deliveryType }))}
            />
          </Field>

          <Field label="Package weight (kg)">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.weightKg}
              onChange={(event) => setForm((current) => ({ ...current, weightKg: Number(event.target.value) || 0 }))}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-black"
            />
          </Field>

          <Field label="Pickup location">
            <input
              type="text"
              placeholder="Real address, e.g. 1 Ferry Building, San Francisco, CA"
              value={form.pickup}
              onChange={(event) => {
                setForm((current) => ({ ...current, pickup: event.target.value }));
                setPickupPlace(null);
                setPickupStatus("idle");
              }}
              onBlur={() => void handlePickupBlur()}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-black"
            />
            <AddressLookupStatusLine status={pickupStatus} place={pickupPlace} />
          </Field>

          <Field label="Drop location">
            <input
              type="text"
              placeholder="Real address, e.g. 1600 Amphitheatre Pkwy, Mountain View, CA"
              value={form.drop}
              onChange={(event) => {
                setForm((current) => ({ ...current, drop: event.target.value }));
                setDropPlace(null);
                setDropStatus("idle");
              }}
              onBlur={() => void handleDropBlur()}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-black"
            />
            <AddressLookupStatusLine status={dropStatus} place={dropPlace} />
          </Field>

          <Field label="Priority">
            <SegmentedControl
              options={priorities}
              value={form.priority}
              onChange={(priority) => setForm((current) => ({ ...current, priority }))}
            />
          </Field>

          <Field label="Drop-off preference">
            <SegmentedControl
              options={dropOffPreferences}
              value={form.dropOffPreference}
              onChange={(dropOffPreference) => setForm((current) => ({ ...current, dropOffPreference }))}
            />
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-neutral-300 bg-white text-sm font-bold text-black transition hover:border-black"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCreating}
            onClick={() => void handleCreate()}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-black bg-black text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:bg-neutral-800",
              isCreating && "cursor-not-allowed opacity-70",
            )}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Locating Addresses…
              </>
            ) : (
              "Create Mission"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressLookupStatusLine({ status, place }: { status: AddressLookupStatus; place: GeoAddress | null }) {
  if (status === "locating") {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Locating address…
      </span>
    );
  }

  if (status === "found" && place) {
    return (
      <span className="mt-1 block text-[10px] font-semibold text-emerald-600">
        ✓ Located ({place.lat.toFixed(4)}, {place.lng.toFixed(4)}) — map will use this real location.
      </span>
    );
  }

  if (status === "not-found") {
    return <span className="mt-1 block text-[10px] font-semibold text-amber-600">Address not found — mission will use the default simulated location.</span>;
  }

  return null;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: T[];
  value: T;
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-neutral-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-xl px-2 py-1.5 text-xs font-bold transition",
            value === option ? "bg-black text-white shadow-sm" : "text-neutral-600 hover:bg-white hover:text-black",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

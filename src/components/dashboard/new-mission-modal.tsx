"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { geocodeAddress } from "@/lib/map/geocode";
import { haversineDistanceKm, kmToMiles } from "@/lib/map/geo-utils";
import { fetchAddressSuggestions, resolvePlaceDetails, type AddressSuggestion } from "@/lib/map/places-autocomplete";
import { cn } from "@/lib/utils";
import type { DeliveryType, DropOffPreference, GeoAddress, MissionPriority, NewMissionInput } from "@/types/domain";

type AddressLookupStatus = "idle" | "locating" | "found" | "not-found";

/** Max allowed pickup → drop distance for a mission. */
const MAX_MISSION_DISTANCE_MILES = 10;

const deliveryTypes: DeliveryType[] = ["Grocery", "Medical", "Small Logistics"];
const priorities: MissionPriority[] = ["Standard", "Express", "Critical"];
const dropOffPreferences: DropOffPreference[] = ["Primary entrance", "Rooftop", "Courtyard"];

export const defaultNewMissionInput: NewMissionInput = {
  deliveryType: "Grocery",
  weightKg: 4.5,
  pickup: "",
  drop: "",
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

  const distanceMiles =
    pickupPlace && dropPlace
      ? kmToMiles(
          haversineDistanceKm(
            { lat: pickupPlace.lat, lng: pickupPlace.lng, altitudeM: 0 },
            { lat: dropPlace.lat, lng: dropPlace.lng, altitudeM: 0 },
          ),
        )
      : null;

  const distanceTooLarge = distanceMiles !== null && distanceMiles > MAX_MISSION_DISTANCE_MILES;

  async function resolveAddress(address: string): Promise<GeoAddress | null> {
    const result = await geocodeAddress(address);
    return result ? { label: result.formattedAddress, lat: result.lat, lng: result.lng } : null;
  }

  async function handleCreate() {
    if (isCreating || distanceTooLarge) {
      return;
    }
    setIsCreating(true);

    let resolvedPickup = pickupPlace;
    let resolvedDrop = dropPlace;

    if (!resolvedPickup && form.pickup.trim()) {
      setPickupStatus("locating");
      resolvedPickup = await resolveAddress(form.pickup);
      setPickupStatus(resolvedPickup ? "found" : "not-found");
      if (resolvedPickup) {
        setPickupPlace(resolvedPickup);
        setForm((current) => ({ ...current, pickup: resolvedPickup!.label }));
      }
    }
    if (!resolvedDrop && form.drop.trim()) {
      setDropStatus("locating");
      resolvedDrop = await resolveAddress(form.drop);
      setDropStatus(resolvedDrop ? "found" : "not-found");
      if (resolvedDrop) {
        setDropPlace(resolvedDrop);
        setForm((current) => ({ ...current, drop: resolvedDrop!.label }));
      }
    }

    if (resolvedPickup && resolvedDrop) {
      const miles = kmToMiles(
        haversineDistanceKm(
          { lat: resolvedPickup.lat, lng: resolvedPickup.lng, altitudeM: 0 },
          { lat: resolvedDrop.lat, lng: resolvedDrop.lng, altitudeM: 0 },
        ),
      );
      if (miles > MAX_MISSION_DISTANCE_MILES) {
        setPickupPlace(resolvedPickup);
        setDropPlace(resolvedDrop);
        setIsCreating(false);
        return;
      }
    }

    setIsCreating(false);
    onCreate({
      ...form,
      pickup: resolvedPickup?.label ?? form.pickup,
      drop: resolvedDrop?.label ?? form.drop,
      pickupPlace: resolvedPickup ?? undefined,
      dropPlace: resolvedDrop ?? undefined,
    });
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

          <AddressAutocompleteField
            label="Pickup location"
            placeholder="Start typing a real address…"
            value={form.pickup}
            status={pickupStatus}
            place={pickupPlace}
            onChange={(pickup) => {
              setForm((current) => ({ ...current, pickup }));
              setPickupPlace(null);
              setPickupStatus("idle");
            }}
            onResolved={(place) => {
              setPickupPlace(place);
              setPickupStatus("found");
              setForm((current) => ({ ...current, pickup: place.label }));
            }}
            onNotFound={() => {
              setPickupPlace(null);
              setPickupStatus("not-found");
            }}
            onLocating={() => setPickupStatus("locating")}
          />

          <AddressAutocompleteField
            label="Drop location"
            placeholder="Start typing a real address…"
            value={form.drop}
            status={dropStatus}
            place={dropPlace}
            onChange={(drop) => {
              setForm((current) => ({ ...current, drop }));
              setDropPlace(null);
              setDropStatus("idle");
            }}
            onResolved={(place) => {
              setDropPlace(place);
              setDropStatus("found");
              setForm((current) => ({ ...current, drop: place.label }));
            }}
            onNotFound={() => {
              setDropPlace(null);
              setDropStatus("not-found");
            }}
            onLocating={() => setDropStatus("locating")}
          />

          {distanceMiles !== null ? (
            <div
              className={cn(
                "rounded-2xl border px-3 py-2 text-[11px] font-semibold leading-snug",
                distanceTooLarge
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
            >
              {distanceTooLarge ? (
                <>
                  Distance is too large ({distanceMiles.toFixed(1)} miles). Pickup and drop must be within{" "}
                  {MAX_MISSION_DISTANCE_MILES} miles of each other.
                </>
              ) : (
                <>Mission distance: {distanceMiles.toFixed(1)} miles (within {MAX_MISSION_DISTANCE_MILES} mile limit)</>
              )}
            </div>
          ) : null}

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
            disabled={isCreating || distanceTooLarge}
            onClick={() => void handleCreate()}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-black bg-black text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:bg-neutral-800",
              (isCreating || distanceTooLarge) && "cursor-not-allowed opacity-70",
            )}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Locating Addresses…
              </>
            ) : distanceTooLarge ? (
              "Distance Too Large"
            ) : (
              "Create Mission"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddressAutocompleteFieldProps {
  label: string;
  placeholder: string;
  value: string;
  status: AddressLookupStatus;
  place: GeoAddress | null;
  onChange: (value: string) => void;
  onResolved: (place: GeoAddress) => void;
  onNotFound: () => void;
  onLocating: () => void;
}

function AddressAutocompleteField({
  label,
  placeholder,
  value,
  status,
  place,
  onChange,
  onResolved,
  onNotFound,
  onLocating,
}: AddressAutocompleteFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const suppressBlurRef = useRef(false);

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const query = value.trim();

    if (status === "found" || status === "locating" || query.length < 3) {
      return;
    }

    const requestId = ++requestIdRef.current;

    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void fetchAddressSuggestions(query).then((results) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
        setIsSearching(false);
      });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [value, status]);

  const queryReady = value.trim().length >= 3;
  const visibleSuggestions = status === "found" || !queryReady ? [] : suggestions;
  const listOpen = open && visibleSuggestions.length > 0;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    suppressBlurRef.current = true;
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.fullText);
    onLocating();

    const details = await resolvePlaceDetails(suggestion.placeId);
    if (details) {
      onResolved({ label: details.formattedAddress, lat: details.lat, lng: details.lng });
    } else {
      const fallback = await geocodeAddress(suggestion.fullText);
      if (fallback) {
        onResolved({ label: fallback.formattedAddress, lat: fallback.lat, lng: fallback.lng });
      } else {
        onNotFound();
      }
    }

    window.setTimeout(() => {
      suppressBlurRef.current = false;
    }, 0);
  }

  async function handleBlur() {
    window.setTimeout(() => {
      if (suppressBlurRef.current) {
        return;
      }
      setOpen(false);

      if (status === "found" || !value.trim()) {
        return;
      }

      onLocating();
      void geocodeAddress(value).then((result) => {
        if (result) {
          onResolved({ label: result.formattedAddress, lat: result.lat, lng: result.lng });
        } else {
          onNotFound();
        }
      });
    }, 120);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!listOpen || visibleSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % visibleSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? visibleSuggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(visibleSuggestions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (visibleSuggestions.length > 0 && status !== "found") {
              setOpen(true);
            }
          }}
          onBlur={() => void handleBlur()}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 pr-9 text-sm font-semibold text-black outline-none focus:border-black"
        />
        {((isSearching && queryReady && status !== "found") || status === "locating") && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-neutral-400" />
        )}
      </div>

      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white py-1 shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
        >
          {visibleSuggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="option" aria-selected={index === activeIndex} id={`${listId}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  suppressBlurRef.current = true;
                }}
                onClick={() => void selectSuggestion(suggestion)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition",
                  index === activeIndex ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-black">{suggestion.primaryText}</span>
                  {suggestion.secondaryText ? (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-neutral-500">{suggestion.secondaryText}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <AddressLookupStatusLine status={status} place={place} />
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
        ✓ {place.label}
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

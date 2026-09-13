/**
 * Server-only placeholder for future FAA / LAANC integrations.
 * The MVP uses labeled public UAS Facility Map guidance plus mock TFR/NOTAM
 * and mock authorization status from `src/data/demo-airspace.ts`.
 */
export async function fetchFaaAirspaceConstraints(): Promise<never> {
  throw new Error(
    "Not implemented: live FAA UAS Facility Map / TFR feeds and LAANC submission are reserved for a later integration phase.",
  );
}

export async function requestLaancAuthorization(): Promise<never> {
  throw new Error(
    "Not implemented: LAANC authorization submission is out of scope for this MVP. Mock authorization status only.",
  );
}

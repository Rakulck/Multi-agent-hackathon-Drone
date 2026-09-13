/**
 * Google Places Autocomplete helpers — returns live address suggestions as
 * the user types, then resolves a selected place to lat/lng.
 *
 * Uses the shared Maps JS loader (`importLibrary("places")`). Never logs the
 * API key and never throws to callers (returns empty / null on failure).
 */
import { importGoogleMapsLibrary } from "@/lib/map/load-google-maps";

export interface AddressSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}

export interface PlaceDetails {
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface AutocompleteSuggestionLike {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string; toString?: () => string };
    mainText?: { text?: string; toString?: () => string };
    secondaryText?: { text?: string; toString?: () => string };
    toPlace?: () => PlaceLike;
  };
}

interface PlaceLike {
  id?: string;
  formattedAddress?: string;
  location?: { lat: () => number; lng: () => number };
  fetchFields: (options: { fields: string[] }) => Promise<void>;
}

interface AutocompleteServiceLike {
  getPlacePredictions: (
    request: { input: string },
    callback: (
      predictions: Array<{
        place_id?: string;
        description?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      }> | null,
      status: string,
    ) => void,
  ) => void;
}

interface PlacesServiceLike {
  getDetails: (
    request: { placeId: string; fields: string[] },
    callback: (
      result: {
        formatted_address?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
      } | null,
      status: string,
    ) => void,
  ) => void;
}

interface PlacesLibraryLike {
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      includedPrimaryTypes?: string[];
    }) => Promise<{ suggestions: AutocompleteSuggestionLike[] }>;
  };
  Place?: new (options: { id: string }) => PlaceLike;
  AutocompleteService?: new () => AutocompleteServiceLike;
  PlacesService?: new (attribution: HTMLElement) => PlacesServiceLike;
}

function getApiKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

function predictionText(value: { text?: string; toString?: () => string } | undefined): string {
  if (!value) return "";
  if (typeof value.text === "string" && value.text.length > 0) return value.text;
  if (typeof value.toString === "function") {
    const asString = value.toString();
    return asString === "[object Object]" ? "" : asString;
  }
  return "";
}

/**
 * Fetches up to 5 live address suggestions for the typed query.
 * Returns [] when the key is missing, the query is too short, or Places fails.
 */
export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  const apiKey = getApiKey();

  if (!apiKey || trimmed.length < 3) {
    return [];
  }

  try {
    const library = (await importGoogleMapsLibrary(apiKey, "places")) as PlacesLibraryLike;

    if (library.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      const { suggestions } = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
      });

      return (suggestions ?? [])
        .map((entry) => {
          const prediction = entry.placePrediction;
          if (!prediction?.placeId) return null;

          const fullText = predictionText(prediction.text);
          const primaryText = predictionText(prediction.mainText) || fullText;
          const secondaryText = predictionText(prediction.secondaryText);

          return {
            placeId: prediction.placeId,
            primaryText,
            secondaryText,
            fullText: fullText || primaryText,
          } satisfies AddressSuggestion;
        })
        .filter((entry): entry is AddressSuggestion => entry !== null)
        .slice(0, 5);
    }

    if (library.AutocompleteService) {
      const service = new library.AutocompleteService();
      return await new Promise<AddressSuggestion[]>((resolve) => {
        service.getPlacePredictions({ input: trimmed }, (predictions, status) => {
          if (status !== "OK" || !predictions) {
            resolve([]);
            return;
          }

          resolve(
            predictions
              .filter((prediction) => Boolean(prediction.place_id))
              .slice(0, 5)
              .map((prediction) => ({
                placeId: prediction.place_id!,
                primaryText: prediction.structured_formatting?.main_text ?? prediction.description ?? "",
                secondaryText: prediction.structured_formatting?.secondary_text ?? "",
                fullText: prediction.description ?? "",
              })),
          );
        });
      });
    }

    return [];
  } catch (error) {
    console.error("[fetchAddressSuggestions]", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Resolves a Places `placeId` to a formatted address + lat/lng. */
export async function resolvePlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = getApiKey();

  if (!apiKey || !placeId) {
    return null;
  }

  try {
    const library = (await importGoogleMapsLibrary(apiKey, "places")) as PlacesLibraryLike;

    if (library.Place) {
      const place = new library.Place({ id: placeId });
      await place.fetchFields({ fields: ["formattedAddress", "location"] });

      const location = place.location;
      if (location) {
        return {
          formattedAddress: place.formattedAddress ?? placeId,
          lat: location.lat(),
          lng: location.lng(),
        };
      }
    }

    if (library.PlacesService) {
      const attribution = document.createElement("div");
      const service = new library.PlacesService(attribution);

      return await new Promise<PlaceDetails | null>((resolve) => {
        service.getDetails({ placeId, fields: ["formatted_address", "geometry"] }, (result, status) => {
          if (status !== "OK" || !result?.geometry?.location) {
            resolve(null);
            return;
          }

          resolve({
            formattedAddress: result.formatted_address ?? placeId,
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
          });
        });
      });
    }

    return null;
  } catch (error) {
    console.error("[resolvePlaceDetails]", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Thin client-side wrapper around the Google Maps JS `Geocoder` — resolves a
 * free-typed address string to a real lat/lng using the same Maps API key
 * (and shared script loader) already used for the 3D scene.
 *
 * Never calls a REST endpoint directly and never logs the API key.
 */
import { importGoogleMapsLibrary } from "@/lib/map/load-google-maps";

export interface GeocodeResult {
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface GeocoderLike {
  geocode: (
    request: { address: string },
    callback: (results: GeocoderResultLike[] | null, status: string) => void,
  ) => void;
}

interface GeocoderResultLike {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
}

let geocoderPromise: Promise<GeocoderLike> | null = null;

function getGeocoder(apiKey: string): Promise<GeocoderLike> {
  if (!geocoderPromise) {
    geocoderPromise = importGoogleMapsLibrary(apiKey, "geocoding").then((library) => {
      const GeocoderCtor = library.Geocoder as new () => GeocoderLike;
      return new GeocoderCtor();
    });
  }
  return geocoderPromise;
}

/**
 * Resolves a free-typed address to a real coordinate. Returns `null` (never
 * throws) when the key is missing, the address doesn't resolve, or the
 * geocoding library fails to load — callers should fall back gracefully.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!trimmed || !apiKey) {
    return null;
  }

  try {
    const geocoder = await getGeocoder(apiKey);

    return await new Promise<GeocodeResult | null>((resolve) => {
      geocoder.geocode({ address: trimmed }, (results, status) => {
        if (status !== "OK" || !results || results.length === 0) {
          resolve(null);
          return;
        }

        const [top] = results;
        const location = top.geometry?.location;

        if (!location) {
          resolve(null);
          return;
        }

        resolve({
          formattedAddress: top.formatted_address ?? trimmed,
          lat: location.lat(),
          lng: location.lng(),
        });
      });
    });
  } catch (error) {
    console.error("[geocodeAddress]", error instanceof Error ? error.message : error);
    return null;
  }
}

import "server-only";

import { z } from "zod";
import { makeDemoWeatherResponse, makeFallbackWeatherResponse } from "@/data/demo-weather";
import type {
  GeoAddress,
  WeatherFetchState,
  WeatherLocationSnapshot,
  WeatherMode,
  WeatherResponse,
  WeatherSnapshotData,
} from "@/types/domain";

const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const REQUEST_TIMEOUT_MS = 5_000;
const METERS_TO_MILES = 0.000621371;

const openWeatherSchema = z.object({
  dt: z.number().finite().positive(),
  main: z.object({
    temp: z.number().finite(),
  }),
  visibility: z.number().finite().nonnegative(),
  weather: z.array(z.object({ description: z.string().min(1) })).min(1),
  wind: z.object({
    speed: z.number().finite().nonnegative(),
    gust: z.number().finite().nonnegative().optional(),
    deg: z.number().finite().min(0).max(360).optional(),
  }),
});

class WeatherServiceError extends Error {
  constructor(
    readonly state: Exclude<WeatherFetchState, "IDLE" | "LOADING" | "SUCCESS">,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchOpenWeatherConditions(params: {
  pickup: GeoAddress;
  dropOff: GeoAddress;
  mode: WeatherMode;
}): Promise<WeatherResponse> {
  if (params.mode !== "LIVE") {
    return makeDemoWeatherResponse(params.mode);
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return makeFallbackWeatherResponse("MISSING_API_KEY", "OPENWEATHER_API_KEY is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const [pickup, dropOff] = await Promise.all([
      fetchLocation(params.pickup, "Pickup", apiKey, controller.signal),
      fetchLocation(params.dropOff, "Drop-off", apiKey, controller.signal),
    ]);

    return {
      status: "SUCCESS",
      weather: combineRouteWeather(pickup, dropOff),
      message: "Live OpenWeather conditions received for pickup and drop-off.",
    };
  } catch (error) {
    if (error instanceof WeatherServiceError) {
      return makeFallbackWeatherResponse(error.state, error.message);
    }
    if (error instanceof Error && error.name === "AbortError") {
      return makeFallbackWeatherResponse("TIMEOUT", "OpenWeather request timed out.");
    }
    return makeFallbackWeatherResponse("API_FAILURE", "OpenWeather request failed.");
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

async function fetchLocation(
  point: GeoAddress,
  label: WeatherLocationSnapshot["label"],
  apiKey: string,
  signal: AbortSignal,
): Promise<WeatherLocationSnapshot> {
  const url = new URL(OPENWEATHER_URL);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "imperial");

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new WeatherServiceError("API_FAILURE", "OpenWeather could not be reached.");
  }

  if (response.status === 429) {
    throw new WeatherServiceError("RATE_LIMIT", "OpenWeather rate limit reached.");
  }
  if (!response.ok) {
    throw new WeatherServiceError("API_FAILURE", `OpenWeather returned HTTP ${response.status}.`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new WeatherServiceError("INVALID_RESPONSE", "OpenWeather returned invalid JSON.");
  }

  const parsed = openWeatherSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WeatherServiceError("INVALID_RESPONSE", "OpenWeather response was missing required weather fields.");
  }

  const value = parsed.data;
  return {
    label,
    windMph: round(value.wind.speed, 1),
    gustMph: round(value.wind.gust ?? value.wind.speed, 1),
    windDirectionDeg: Math.round(value.wind.deg ?? 0),
    visibilityMiles: round(value.visibility * METERS_TO_MILES, 1),
    temperatureF: round(value.main.temp, 1),
    condition: value.weather[0].description,
    timestamp: new Date(value.dt * 1_000).toISOString(),
  };
}

function combineRouteWeather(
  pickup: WeatherLocationSnapshot,
  dropOff: WeatherLocationSnapshot,
): WeatherSnapshotData {
  const windReference = pickup.gustMph >= dropOff.gustMph ? pickup : dropOff;
  const timestamp =
    new Date(pickup.timestamp).getTime() >= new Date(dropOff.timestamp).getTime()
      ? pickup.timestamp
      : dropOff.timestamp;
  const conditions = Array.from(new Set([pickup.condition, dropOff.condition])).join(" / ");

  return {
    windMph: Math.max(pickup.windMph, dropOff.windMph),
    gustMph: Math.max(pickup.gustMph, dropOff.gustMph),
    windDirectionDeg: windReference.windDirectionDeg,
    visibilityMiles: Math.min(pickup.visibilityMiles, dropOff.visibilityMiles),
    temperatureF: round((pickup.temperatureF + dropOff.temperatureF) / 2, 1),
    condition: conditions,
    updatedAt: timestamp,
    dataSource: "LIVE",
    locations: { pickup, dropOff },
  };
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

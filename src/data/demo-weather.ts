import type {
  WeatherFetchState,
  WeatherLocationSnapshot,
  WeatherMode,
  WeatherResponse,
  WeatherSnapshotData,
} from "@/types/domain";

type DemoWeatherMode = Exclude<WeatherMode, "LIVE">;

const scenarios: Record<
  DemoWeatherMode,
  Omit<WeatherLocationSnapshot, "label" | "timestamp">
> = {
  SAFE: {
    windMph: 7,
    gustMph: 9,
    windDirectionDeg: 245,
    visibilityMiles: 10,
    temperatureF: 68,
    condition: "Clear",
  },
  MODERATE: {
    windMph: 15,
    gustMph: 17,
    windDirectionDeg: 275,
    visibilityMiles: 7,
    temperatureF: 64,
    condition: "Breezy",
  },
  UNSAFE: {
    windMph: 30,
    gustMph: 35,
    windDirectionDeg: 300,
    visibilityMiles: 4,
    temperatureF: 61,
    condition: "High wind",
  },
};

export function makeDemoWeather(mode: DemoWeatherMode): WeatherSnapshotData {
  const timestamp = new Date().toISOString();
  const scenario = scenarios[mode];
  const pickup: WeatherLocationSnapshot = { ...scenario, label: "Pickup", timestamp };
  const dropOff: WeatherLocationSnapshot = { ...scenario, label: "Drop-off", timestamp };

  return {
    ...scenario,
    updatedAt: timestamp,
    dataSource: "DEMO_FALLBACK",
    locations: { pickup, dropOff },
  };
}

export function makeFallbackWeatherResponse(
  status: Exclude<WeatherFetchState, "IDLE" | "LOADING" | "SUCCESS">,
  message: string,
): WeatherResponse {
  return {
    status,
    weather: makeDemoWeather("SAFE"),
    message: `${message} Deterministic SAFE demo weather applied; this data is not live.`,
  };
}

export function makeDemoWeatherResponse(mode: DemoWeatherMode): WeatherResponse {
  return {
    status: "SUCCESS",
    weather: makeDemoWeather(mode),
    message: `Deterministic ${mode} demo scenario selected; this data is not live.`,
  };
}

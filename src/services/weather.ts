import "server-only";

export async function fetchOpenWeatherConditions(): Promise<never> {
  throw new Error("Not implemented: OpenWeather checks are reserved for the integration phase.");
}

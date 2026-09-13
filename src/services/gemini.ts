import "server-only";

export async function requestGeminiExplanation(): Promise<never> {
  throw new Error("Not implemented: Gemini calls are reserved for the integration phase.");
}

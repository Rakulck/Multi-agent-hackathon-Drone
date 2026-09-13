import "server-only";

export async function sendSlackOperatorAlert(): Promise<never> {
  throw new Error("Not implemented: Slack alerts are reserved for the integration phase.");
}

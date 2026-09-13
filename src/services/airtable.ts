import "server-only";

export async function createAirtableMemoryRecord(): Promise<never> {
  throw new Error("Not implemented: Airtable persistence is reserved for the integration phase.");
}

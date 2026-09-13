import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadActiveAirtableMemories } from "@/services/airtable";

describe("Airtable memory response states", () => {
  beforeEach(() => {
    vi.stubEnv("AIRTABLE_PERSONAL_ACCESS_TOKEN", "test-token");
    vi.stubEnv("AIRTABLE_BASE_ID", "app-test");
    vi.stubEnv("AIRTABLE_MEMORY_TABLE_NAME", "Operational Memory");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("classifies a valid zero-record response as SUCCESS_EMPTY", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await loadActiveAirtableMemories();

    expect(result.status).toBe("SUCCESS_EMPTY");
    expect(result.memories).toEqual([]);
    expect(result.message).toBe("No relevant shared hazards found.");
  });

  it("classifies malformed Airtable data as API_FAILURE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ records: "not-an-array" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await loadActiveAirtableMemories();

    expect(result.status).toBe("API_FAILURE");
    expect(result.memories).toEqual([]);
  });

  it("classifies a failed Airtable request as API_FAILURE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await loadActiveAirtableMemories();

    expect(result.status).toBe("API_FAILURE");
    expect(result.memories).toEqual([]);
  });
});

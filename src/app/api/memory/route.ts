import { NextResponse } from "next/server";
import { z } from "zod";
import { createAirtableMemoryRecord, loadActiveAirtableMemories } from "@/services/airtable";
import type { MemoryApiResponse } from "@/types/domain";

export const runtime = "nodejs";

const memorySchema = z.object({
  id: z.string().min(1),
  learnedBy: z.string().min(1),
  routeId: z.enum(["A", "B", "C"]),
  hazardType: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  severity: z.enum(["Low", "Medium", "High"]),
  confidence: z.number().finite().min(0).max(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  summary: z.string().min(1),
  altitudeBandM: z.tuple([z.number().finite(), z.number().finite()]),
  avoidanceRadiusM: z.number().finite().positive(),
  sourceVendor: z.string().min(1),
  sourceMission: z.string().min(1),
  status: z.literal("Active"),
  verificationStatus: z.literal("Human Verified"),
  verifiedAt: z.string().datetime(),
  verifiedBy: z.string().min(1),
  dataSource: z.enum(["AIRTABLE", "DEMO_FALLBACK"]),
  airtableStatus: z.enum(["saving", "saved", "failed", "fallback"]),
});

export async function GET() {
  const result = await loadActiveAirtableMemories();
  return NextResponse.json(result, { status: httpStatusForMemoryResponse(result) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const result = invalidResponse("Memory request body was invalid.");
    return NextResponse.json(result, { status: httpStatusForMemoryResponse(result) });
  }

  const parsed = z.object({ memory: memorySchema }).safeParse(body);
  if (!parsed.success) {
    const result = invalidResponse("Structured operational memory was invalid.");
    return NextResponse.json(result, { status: httpStatusForMemoryResponse(result) });
  }

  const result = await createAirtableMemoryRecord(parsed.data.memory);
  return NextResponse.json(result, { status: httpStatusForMemoryResponse(result) });
}

function invalidResponse(message: string): MemoryApiResponse {
  return {
    status: "INVALID_RESPONSE",
    memories: [],
    message,
    source: "AIRTABLE",
  };
}

function httpStatusForMemoryResponse(response: MemoryApiResponse): number {
  switch (response.status) {
    case "SUCCESS":
    case "SUCCESS_EMPTY":
      return 200;
    case "INVALID_RESPONSE":
      return 400;
    case "MISSING_KEY":
      return 500;
    case "TIMEOUT":
      return 504;
    case "API_FAILURE":
      return response.upstream?.statusCode &&
        response.upstream.statusCode >= 400 &&
        response.upstream.statusCode <= 599
        ? response.upstream.statusCode
        : 502;
    default:
      return 500;
  }
}

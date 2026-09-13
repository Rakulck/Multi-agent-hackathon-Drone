import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createObstacleMemory,
  evaluateObstacleSafety,
  makeDemoFallbackObservation,
  makeGeminiFailureDecision,
  type ObstacleAnalysisContext,
} from "@/lib/obstacle-analysis";
import { analyzeObstacleWithGemini } from "@/services/gemini";
import type {
  GeminiObstacleApiResponse,
  GeminiObstacleObservation,
  GeminiObservationSource,
  OperationalMemory,
} from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    mode: z.enum(["LIVE", "DEMO_FALLBACK"]).default("LIVE"),
    missionId: z.string().trim().min(1).max(100),
    droneId: z.string().trim().min(1).max(100),
    sourceVendor: z.string().trim().min(1).max(100),
    currentRoute: z.enum(["A", "B", "C"]),
    droneCoordinates: z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    }),
    altitudeM: z.number().finite().min(0).max(1_000),
    routeWaypoints: z
      .array(
        z.object({
          lat: z.number().finite().min(-90).max(90),
          lng: z.number().finite().min(-180).max(180),
          altitude: z.number().finite().min(0).max(1_000),
        }),
      )
      .min(2)
      .max(50),
  })
  .strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("Obstacle-analysis request body was invalid.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest("Obstacle-analysis request fields were invalid.");
  }

  const context: ObstacleAnalysisContext = parsed.data;
  const result =
    parsed.data.mode === "DEMO_FALLBACK"
      ? makeFallbackResult(context)
      : await analyzeObstacleWithGemini(context);

  if (!result.ok) {
    const response: GeminiObstacleApiResponse = {
      status: "GEMINI_API_FAILURE",
      source: null,
      model: result.model,
      message: result.message,
      latencyMs: result.latencyMs,
      schemaValidation: result.schemaValidation,
      observation: null,
      decision: makeGeminiFailureDecision(),
      memory: null,
      memorySaveStatus: "NOT_APPLICABLE",
      memorySaveMessage:
        "No memory saved because Gemini perception did not validate.",
    };
    logAnalysis(response, context.missionId, false);
    return NextResponse.json(response, {
      status: result.failureKind === "TIMEOUT" ? 504 : 502,
    });
  }

  const decision = evaluateObstacleSafety(result.observation, context);
  let memory: OperationalMemory | null = null;
  let memorySaveStatus: GeminiObstacleApiResponse["memorySaveStatus"] =
    "NOT_APPLICABLE";
  let memorySaveMessage =
    "No memory saved because the observation is not route-relevant.";

  if (decision.relevantForMemory) {
    memory = createObstacleMemory({
      observation: result.observation,
      decision,
      context,
      source: result.source,
    });
    memorySaveStatus = "AWAITING_APPROVAL";
    memorySaveMessage =
      "Draft evaluated deterministically. Airtable remains unchanged until a signed Slack approval is verified.";
  }

  const response: GeminiObstacleApiResponse = {
    status: "SUCCESS",
    source: result.source,
    model: result.model,
    message:
      result.source === "GEMINI"
        ? "Gemini perception validated; deterministic safety rules evaluated it."
        : "DEMO_FALLBACK perception used; this is not a real Gemini response.",
    latencyMs: result.latencyMs,
    schemaValidation: true,
    observation: result.observation,
    decision,
    memory,
    memorySaveStatus,
    memorySaveMessage,
  };
  logAnalysis(response, context.missionId, true);
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

function makeFallbackResult(context: ObstacleAnalysisContext): {
  ok: true;
  source: GeminiObservationSource;
  model: string;
  latencyMs: number;
  schemaValidation: true;
  observation: GeminiObstacleObservation;
} {
  return {
    ok: true,
    source: "DEMO_FALLBACK",
    model: "DEMO_FALLBACK",
    latencyMs: 0,
    schemaValidation: true,
    observation: makeDemoFallbackObservation(context),
  };
}

function invalidRequest(message: string) {
  const response: GeminiObstacleApiResponse = {
    status: "INVALID_REQUEST",
    source: null,
    model: "not-started",
    message,
    latencyMs: 0,
    schemaValidation: false,
    observation: null,
    decision: makeGeminiFailureDecision(
      "Obstacle-analysis input was invalid; deterministic rules require a safe hold.",
    ),
    memory: null,
    memorySaveStatus: "NOT_APPLICABLE",
    memorySaveMessage: "No memory saved because the request was invalid.",
  };
  return NextResponse.json(response, { status: 400 });
}

function logAnalysis(
  response: GeminiObstacleApiResponse,
  missionId: string,
  success: boolean,
) {
  const entry = {
    timestamp: new Date().toISOString(),
    missionId: sanitizeLogValue(missionId),
    modelUsed: sanitizeLogValue(response.model),
    latencyMs: response.latencyMs,
    success,
    confidence: response.observation?.confidence ?? null,
    schemaValidation: response.schemaValidation,
    deterministicAction: response.decision.action,
    source: response.source,
  };
  const method =
    response.status === "SUCCESS" ? console.info : console.error;
  method("[gemini-obstacle]", JSON.stringify(entry));
}

function sanitizeLogValue(value: string) {
  return value.replace(/[\r\n\t]/g, " ").slice(0, 100);
}

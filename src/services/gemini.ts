import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  geminiResponseJsonSchema,
  parseGeminiObstacleObservation,
  type ObstacleAnalysisContext,
} from "@/lib/obstacle-analysis";
import type { GeminiObstacleObservation } from "@/types/domain";

const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 10_000;
const CRANE_IMAGE_PATH = path.join(
  process.cwd(),
  "public",
  "demo",
  "construction-crane.jpg",
);

export type GeminiFailureKind =
  | "MISSING_API_KEY"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "API_FAILURE";

export type GeminiServiceResult =
  | {
      ok: true;
      source: "GEMINI";
      model: string;
      latencyMs: number;
      schemaValidation: true;
      observation: GeminiObstacleObservation;
    }
  | {
      ok: false;
      model: string;
      latencyMs: number;
      schemaValidation: boolean;
      failureKind: GeminiFailureKind;
      message: string;
    };

export async function analyzeObstacleWithGemini(
  context: ObstacleAnalysisContext,
): Promise<GeminiServiceResult> {
  const startedAt = performance.now();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return failure(
      model,
      startedAt,
      "MISSING_API_KEY",
      false,
      "GEMINI_API_FAILURE: GEMINI_API_KEY is not configured.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const image = await readFile(CRANE_IMAGE_PATH);
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPerceptionPrompt(context) },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: image.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        abortSignal: controller.signal,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        responseMimeType: "application/json",
        responseJsonSchema: geminiResponseJsonSchema,
        temperature: 0,
        systemInstruction:
          "You are a drone-camera perception system. Identify and describe visible obstacles only. Never approve a mission, select or reject a route, command a drone, or override safety rules. Return only the requested JSON.",
      },
    });
    const text = response.text;
    if (!text) {
      return failure(
        model,
        startedAt,
        "INVALID_RESPONSE",
        false,
        "GEMINI_API_FAILURE: Gemini returned no structured perception data.",
      );
    }

    try {
      const observation = parseGeminiObstacleObservation(text);
      return {
        ok: true,
        source: "GEMINI",
        model,
        latencyMs: elapsedMs(startedAt),
        schemaValidation: true,
        observation,
      };
    } catch {
      return failure(
        model,
        startedAt,
        "INVALID_RESPONSE",
        false,
        "GEMINI_API_FAILURE: Gemini output failed schema validation.",
      );
    }
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.toLowerCase().includes("timeout")))
    ) {
      return failure(
        model,
        startedAt,
        "TIMEOUT",
        false,
        "GEMINI_API_FAILURE: Gemini obstacle analysis timed out.",
      );
    }
    return failure(
      model,
      startedAt,
      "API_FAILURE",
      false,
      "GEMINI_API_FAILURE: Gemini obstacle analysis failed.",
    );
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

function buildPerceptionPrompt(context: ObstacleAnalysisContext) {
  return [
    "Analyze the attached simulated drone-camera frame for a construction-crane obstacle.",
    "Perform perception and description only; do not make operational or safety decisions.",
    `Mission ID: ${context.missionId}`,
    `Drone ID: ${context.droneId}`,
    `Current route: Route ${context.currentRoute}`,
    `Drone coordinates: ${context.droneCoordinates.latitude}, ${context.droneCoordinates.longitude}`,
    `Altitude: ${context.altitudeM} m`,
    "Use the drone coordinates as the obstacle-coordinate estimate when the visible obstacle is in the active corridor.",
    "If no obstacle is visible, set obstacleDetected to false while still returning every required field.",
  ].join("\n");
}

function failure(
  model: string,
  startedAt: number,
  failureKind: GeminiFailureKind,
  schemaValidation: boolean,
  message: string,
): GeminiServiceResult {
  return {
    ok: false,
    model,
    latencyMs: elapsedMs(startedAt),
    schemaValidation,
    failureKind,
    message,
  };
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

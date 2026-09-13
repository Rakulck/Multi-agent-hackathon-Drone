import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createApprovalRecord,
  expireApprovalIfNeeded,
  getApprovalRecord,
  markApprovalPending,
  markMessageUpdateAttempted,
  markSlackApiFailed,
  noteSlackUpdateFailure,
  toApprovalApiResponse,
  type SlackApprovalRecord,
} from "@/lib/slack-approval-store";
import {
  sendSlackApprovalMessage,
  SlackApiError,
  updateSlackApprovalMessage,
} from "@/services/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createApprovalSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  missionId: z.string().min(1).max(100),
  droneName: z.string().min(1).max(100),
  vendorName: z.string().min(1).max(100).optional(),
  approvalKind: z
    .enum(["GENERAL_CAUTION", "LIVE_OBSTACLE_REROUTE"])
    .default("GENERAL_CAUTION"),
  currentStatus: z.string().min(1).max(100),
  coordinates: z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    altitudeM: z.number().finite(),
  }),
  reason: z.string().min(1).max(1_000),
  risks: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        kind: z.enum([
          "WEATHER_MARGIN",
          "BATTERY_RESERVE",
          "OBSTACLE_CONFIDENCE",
          "AIRSPACE_PROXIMITY",
          "ROUTE_ADJUSTMENT",
          "DELIVERY_ZONE",
          "HARD_SAFETY_LIMIT",
        ]),
        level: z.literal("CAUTION"),
        riskDetected: z.string().min(1).max(500),
        currentValue: z.string().min(1).max(300),
        allowedLimit: z.string().min(1).max(300),
        agentRecommendation: z.string().min(1).max(500),
        proposedAdjustment: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(10),
  proposedAlternative: z.string().min(1).max(500),
  routeImpact: z.string().min(1).max(500),
  etaImpact: z.string().min(1).max(200),
  liveObstacle: z
    .object({
      detectedObstacle: z.string().min(1).max(200),
      geminiConfidence: z.number().finite().min(0).max(1),
      currentRoute: z.enum(["A", "B", "C"]),
      recommendedRoute: z.enum(["A", "B", "C"]),
      recommendedAltitudeM: z.number().finite().min(0).max(1_000),
      rejectionReason: z.string().min(1).max(1_000),
    })
    .optional(),
  memoryDraft: z
    .object({
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
      status: z.literal("Inactive"),
      verificationStatus: z.literal("Awaiting Verification"),
      dataSource: z.enum(["AIRTABLE", "DEMO_FALLBACK"]),
      airtableStatus: z.literal("draft"),
    })
    .optional(),
}).superRefine((value, context) => {
  if (
    value.approvalKind === "LIVE_OBSTACLE_REROUTE" &&
    (!value.liveObstacle || !value.memoryDraft || !value.vendorName)
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Live obstacle approvals require vendor, obstacle, and memory-draft details.",
    });
  }
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { state: "INVALID_REQUEST", message: "Slack approval request body was invalid." },
      { status: 400 },
    );
  }

  const parsed = createApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { state: "INVALID_REQUEST", message: "Slack approval request fields were invalid." },
      { status: 400 },
    );
  }

  const slackConfigured = Boolean(
    process.env.SLACK_BOT_TOKEN &&
      process.env.SLACK_CHANNEL_ID &&
      process.env.SLACK_SIGNING_SECRET,
  );
  const { record, duplicate } = createApprovalRecord(parsed.data, slackConfigured);
  if (duplicate || !slackConfigured) {
    return NextResponse.json(toApprovalApiResponse(record, duplicate));
  }

  try {
    const reference = await sendSlackApprovalMessage(record.approval);
    const pending = markApprovalPending(record.approval.requestId, reference) ?? record;
    return NextResponse.json(toApprovalApiResponse(pending));
  } catch (error) {
    const message =
      error instanceof SlackApiError
        ? error.message
        : "Slack API request failed with an unknown error.";
    const failed = markSlackApiFailed(record.approval.requestId, message) ?? record;
    return NextResponse.json(toApprovalApiResponse(failed));
  }
}

export async function GET(request: Request) {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json(
      { state: "INVALID_REQUEST", message: "requestId is required." },
      { status: 400 },
    );
  }

  const record = getApprovalRecord(requestId);
  if (!record) {
    return NextResponse.json(
      { state: "NOT_FOUND", message: "Approval request was not found or is no longer retained." },
      { status: 404 },
    );
  }

  const expiry = expireApprovalIfNeeded(record);
  if (expiry.justExpired) {
    await updateOriginalMessageOnce(expiry.record);
  }

  return NextResponse.json(toApprovalApiResponse(expiry.record), {
    headers: { "Cache-Control": "no-store" },
  });
}

async function updateOriginalMessageOnce(record: SlackApprovalRecord) {
  if (!record.slackReference || record.messageUpdateAttempted) return;
  markMessageUpdateAttempted(record.approval.requestId);
  try {
    await updateSlackApprovalMessage({
      approval: record.approval,
      reference: record.slackReference,
      status: record.status,
      operatorName: record.operatorName,
      statusMessage: record.statusMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    noteSlackUpdateFailure(record.approval.requestId, message);
  }
}

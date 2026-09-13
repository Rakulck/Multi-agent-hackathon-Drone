import "server-only";

import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import type {
  MissionRiskCondition,
  OperationalMemory,
  RouteId,
  SlackApprovalKind,
  SlackApprovalStatus,
} from "@/types/domain";

export interface SlackApprovalMessage {
  requestId: string;
  missionId: string;
  droneName: string;
  vendorName?: string;
  approvalKind: SlackApprovalKind;
  currentStatus: string;
  coordinates: {
    lat: number;
    lng: number;
    altitudeM: number;
  };
  reason: string;
  risks: MissionRiskCondition[];
  proposedAlternative: string;
  routeImpact: string;
  etaImpact: string;
  expiresAt: string;
  liveObstacle?: {
    detectedObstacle: string;
    geminiConfidence: number;
    currentRoute: RouteId;
    recommendedRoute: RouteId;
    recommendedAltitudeM: number;
    rejectionReason: string;
  };
  memoryDraft?: OperationalMemory;
}

export interface SlackMessageReference {
  channelId: string;
  messageTs: string;
}

export class SlackConfigurationError extends Error {
  constructor() {
    super("Slack is unavailable because SLACK_BOT_TOKEN or SLACK_CHANNEL_ID is missing.");
    this.name = "SlackConfigurationError";
  }
}

export class SlackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackApiError";
  }
}

export function hasSlackMessageConfiguration(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
}

export async function sendSlackApprovalMessage(
  approval: SlackApprovalMessage,
): Promise<SlackMessageReference> {
  const config = getSlackMessageConfig();
  const client = new WebClient(config.botToken);

  try {
    const response = await client.chat.postMessage({
      channel: config.channelId,
      text: `Approval required for mission ${approval.missionId}: ${approval.reason}`,
      blocks: buildPendingBlocks(approval),
    });

    if (!response.ok || !response.ts) {
      throw new SlackApiError("Slack did not return a message timestamp.");
    }

    return { channelId: config.channelId, messageTs: response.ts };
  } catch (error) {
    if (error instanceof SlackApiError) throw error;
    throw new SlackApiError(`Slack message delivery failed: ${slackErrorCode(error)}.`);
  }
}

export async function updateSlackApprovalMessage(params: {
  approval: SlackApprovalMessage;
  reference: SlackMessageReference;
  status: SlackApprovalStatus;
  operatorName?: string;
  statusMessage: string;
}): Promise<void> {
  const config = getSlackMessageConfig();
  const client = new WebClient(config.botToken);

  try {
    const response = await client.chat.update({
      channel: params.reference.channelId,
      ts: params.reference.messageTs,
      text: `Mission ${params.approval.missionId} approval: ${statusLabel(params.status)}`,
      blocks: buildResolvedBlocks(params),
    });

    if (!response.ok) {
      throw new SlackApiError("Slack did not confirm the message update.");
    }
  } catch (error) {
    if (error instanceof SlackApiError) throw error;
    throw new SlackApiError(`Slack message update failed: ${slackErrorCode(error)}.`);
  }
}

export async function sendSlackOperatorAlert(params: {
  missionId: string;
  title: string;
  reason: string;
  recommendedAction: string;
}): Promise<void> {
  const config = getSlackMessageConfig();
  const client = new WebClient(config.botToken);
  try {
    const response = await client.chat.postMessage({
      channel: config.channelId,
      text: `${params.title} for mission ${params.missionId}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: params.title, emoji: true },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Mission ID*\n${params.missionId}` },
            { type: "mrkdwn", text: "*Drone state*\nHOLD" },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Reason*\n${params.reason}` },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Operator action*\n${params.recommendedAction}`,
          },
        },
      ],
    });
    if (!response.ok) {
      throw new SlackApiError("Slack did not confirm the operator alert.");
    }
  } catch (error) {
    if (error instanceof SlackApiError) throw error;
    throw new SlackApiError(
      `Slack operator alert failed: ${slackErrorCode(error)}.`,
    );
  }
}

function getSlackMessageConfig() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!botToken || !channelId) throw new SlackConfigurationError();
  return { botToken, channelId };
}

function buildPendingBlocks(approval: SlackApprovalMessage): KnownBlock[] {
  const coordinates = `${approval.coordinates.lat.toFixed(5)}, ${approval.coordinates.lng.toFixed(5)} · ${Math.round(approval.coordinates.altitudeM)} m`;
  if (approval.approvalKind === "LIVE_OBSTACLE_REROUTE" && approval.liveObstacle) {
    const obstacle = approval.liveObstacle;
    return [
      {
        type: "header",
        text: { type: "plain_text", text: "Live obstacle authorization required", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Mission ID*\n${approval.missionId}` },
          { type: "mrkdwn", text: `*Drone / vendor*\n${approval.droneName} · ${approval.vendorName ?? "Unknown vendor"}` },
          { type: "mrkdwn", text: `*Detected obstacle*\n${obstacle.detectedObstacle}` },
          { type: "mrkdwn", text: `*Gemini confidence*\n${Math.round(obstacle.geminiConfidence * 100)}%` },
          { type: "mrkdwn", text: `*Current route / altitude*\nRoute ${obstacle.currentRoute} · ${Math.round(approval.coordinates.altitudeM)} m` },
          { type: "mrkdwn", text: `*Safe HOLD coordinates*\n${coordinates}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Why Route ${obstacle.currentRoute} was rejected*\n${obstacle.rejectionReason}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Option 1 · continue current route*\nAdjust to ${Math.round(obstacle.recommendedAltitudeM)} m` },
          { type: "mrkdwn", text: `*Option 2 · alternate path*\nRoute ${obstacle.recommendedRoute}` },
        ],
      },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `Observation: Gemini. Safety decision: deterministic engine. Authorization: operator. No response by <!date^${Math.floor(new Date(approval.expiresAt).getTime() / 1000)}^{time}|timeout> keeps the drone holding.`,
        }],
      },
      {
        type: "actions",
        block_id: `live_obstacle_${approval.requestId}`,
        elements: [
          {
            type: "button",
            action_id: "adjust_altitude",
            text: { type: "plain_text", text: "Adjust altitude", emoji: true },
            style: "primary",
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "choose_alternate_route",
            text: { type: "plain_text", text: "Choose Route C", emoji: true },
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "return_home",
            text: { type: "plain_text", text: "Return Home", emoji: true },
            style: "danger",
            value: approval.requestId,
          },
        ],
      },
    ];
  }

  const routeChangeRisk = approval.risks.find(
    (risk) => risk.id === "shared-memory-route-change",
  );
  if (routeChangeRisk) {
    const weatherRisk = approval.risks.find(
      (risk) => risk.kind === "WEATHER_MARGIN",
    );
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🛣️ *Mission 2 route approval* — Route A blocked by crane memory; Route C unavailable for FAA; approve Route B before takeoff?${weatherRisk ? ` Weather: ${weatherRisk.currentValue}.` : ""}`,
        },
      },
      {
        type: "actions",
        block_id: `mission_approval_${approval.requestId}`,
        elements: [
          {
            type: "button",
            action_id: "approve_mission_adjustment",
            text: { type: "plain_text", text: "Approve Route B", emoji: true },
            style: "primary",
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "keep_mission_on_hold",
            text: { type: "plain_text", text: "Keep Hold", emoji: true },
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "reject_mission",
            text: { type: "plain_text", text: "Reject", emoji: true },
            style: "danger",
            value: approval.requestId,
          },
        ],
      },
    ];
  }

  const weatherRisk =
    approval.risks.length === 1 &&
    approval.risks[0].kind === "WEATHER_MARGIN"
      ? approval.risks[0]
      : null;
  if (weatherRisk) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Weather approval · ${approval.droneName}* — ${weatherRisk.currentValue}, limit ${weatherRisk.allowedLimit}; approve reduced speed?`,
        },
      },
      {
        type: "actions",
        block_id: `mission_approval_${approval.requestId}`,
        elements: [
          {
            type: "button",
            action_id: "approve_mission_adjustment",
            text: { type: "plain_text", text: "Approve", emoji: true },
            style: "primary",
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "keep_mission_on_hold",
            text: { type: "plain_text", text: "Keep Hold", emoji: true },
            value: approval.requestId,
          },
          {
            type: "button",
            action_id: "reject_mission",
            text: { type: "plain_text", text: "Reject", emoji: true },
            style: "danger",
            value: approval.requestId,
          },
        ],
      },
    ];
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Drone mission approval required", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Mission ID*\n${approval.missionId}` },
        { type: "mrkdwn", text: `*Drone*\n${approval.droneName}${approval.vendorName ? ` · ${approval.vendorName}` : ""}` },
        { type: "mrkdwn", text: `*Current status*\n${approval.currentStatus}` },
        { type: "mrkdwn", text: `*Coordinates*\n${coordinates}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Grouped CAUTION review · ${approval.risks.length} risk${approval.risks.length === 1 ? "" : "s"} detected*\n${approval.reason}`,
      },
    },
    ...approval.risks.map(
      (risk): KnownBlock => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Risk detected*\n${risk.riskDetected}\n*Current value versus allowed limit*\n${risk.currentValue}  •  ${risk.allowedLimit}\n*Agent recommendation*\n${risk.agentRecommendation}\n*Proposed adjustment*\n${risk.proposedAdjustment}`,
        },
      }),
    ),
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Proposed alternative*\n${approval.proposedAlternative}` },
        { type: "mrkdwn", text: `*Route / ETA impact*\n${approval.routeImpact}\n${approval.etaImpact}` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Drone is holding safely. No response by <!date^${Math.floor(new Date(approval.expiresAt).getTime() / 1000)}^{time}|timeout> keeps it paused.`,
        },
      ],
    },
    {
      type: "actions",
      block_id: `mission_approval_${approval.requestId}`,
      elements: [
        {
          type: "button",
          action_id: "approve_mission_adjustment",
          text: { type: "plain_text", text: "Approve adjustment", emoji: true },
          style: "primary",
          value: approval.requestId,
        },
        {
          type: "button",
          action_id: "keep_mission_on_hold",
          text: { type: "plain_text", text: "Keep mission on hold", emoji: true },
          value: approval.requestId,
        },
        {
          type: "button",
          action_id: "reject_mission",
          text: { type: "plain_text", text: "Reject mission", emoji: true },
          style: "danger",
          value: approval.requestId,
          confirm: {
            title: { type: "plain_text", text: "Reject this mission?" },
            text: { type: "mrkdwn", text: "The drone will abort and remain safely stopped." },
            confirm: { type: "plain_text", text: "Reject mission" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
  ];
}

function buildResolvedBlocks(params: {
  approval: SlackApprovalMessage;
  status: SlackApprovalStatus;
  operatorName?: string;
  statusMessage: string;
}): KnownBlock[] {
  const actor = params.operatorName ? ` by *${params.operatorName}*` : "";
  if (
    params.approval.risks.some(
      (risk) => risk.id === "shared-memory-route-change",
    )
  ) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${params.status === "APPROVED" ? "✅" : "⚠️"} *Mission 2 Route B · ${statusLabel(params.status)}${actor}* — preflight route decision recorded.`,
        },
      },
    ];
  }
  if (
    params.approval.risks.length === 1 &&
    params.approval.risks[0].kind === "WEATHER_MARGIN"
  ) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${params.status === "APPROVED" ? "✅" : "⚠️"} *Weather approval · ${statusLabel(params.status)}${actor}* — ${params.approval.droneName}, ${params.approval.risks[0].currentValue}.`,
        },
      },
    ];
  }
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Mission approval · ${statusLabel(params.status)}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Mission ID*\n${params.approval.missionId}` },
        { type: "mrkdwn", text: `*Drone*\n${params.approval.droneName}` },
        { type: "mrkdwn", text: `*Decision*\n${statusLabel(params.status)}${actor}` },
        { type: "mrkdwn", text: `*Proposed adjustment*\n${params.approval.proposedAlternative}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: params.statusMessage },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Interactive controls are closed for this approval event." }],
    },
  ];
}

function statusLabel(status: SlackApprovalStatus): string {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "HELD":
      return "Held";
    case "REJECTED":
      return "Rejected";
    case "TIMED_OUT":
      return "Timed out";
    case "SLACK_UPDATE_FAILED":
      return "Decision recorded (message update failed)";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

function slackErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { code?: unknown; data?: { error?: unknown } };
  if (typeof candidate.data?.error === "string") return candidate.data.error;
  if (typeof candidate.code === "string") return candidate.code;
  return "unknown_error";
}

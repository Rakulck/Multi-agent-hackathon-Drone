import "server-only";

import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import type { MissionRiskCondition, SlackApprovalStatus } from "@/types/domain";

export interface SlackApprovalMessage {
  requestId: string;
  missionId: string;
  droneName: string;
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

function getSlackMessageConfig() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!botToken || !channelId) throw new SlackConfigurationError();
  return { botToken, channelId };
}

function buildPendingBlocks(approval: SlackApprovalMessage): KnownBlock[] {
  const coordinates = `${approval.coordinates.lat.toFixed(5)}, ${approval.coordinates.lng.toFixed(5)} · ${Math.round(approval.coordinates.altitudeM)} m`;

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Drone mission approval required", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Mission ID*\n${approval.missionId}` },
        { type: "mrkdwn", text: `*Drone*\n${approval.droneName}` },
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

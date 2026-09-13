import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ApprovalDecision,
  ApprovalTransport,
  LiveObstacleMitigation,
  OperationalMemory,
  RouteId,
  SlackApprovalKind,
  SlackApprovalApiResponse,
  SlackApprovalStatus,
} from "@/types/domain";
import type { SlackApprovalMessage, SlackMessageReference } from "@/services/slack";

const APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;
const RETENTION_MS = 60 * 60 * 1000;

export interface CreateSlackApprovalInput {
  idempotencyKey: string;
  missionId: string;
  droneName: string;
  vendorName?: string;
  approvalKind: SlackApprovalKind;
  currentStatus: string;
  coordinates: SlackApprovalMessage["coordinates"];
  reason: string;
  risks: SlackApprovalMessage["risks"];
  proposedAlternative: string;
  routeImpact: string;
  etaImpact: string;
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

export interface SlackApprovalRecord {
  idempotencyKey: string;
  approval: SlackApprovalMessage;
  status: SlackApprovalStatus;
  transport: ApprovalTransport;
  createdAt: string;
  expiresAt: string;
  operatorName?: string;
  statusMessage: string;
  slackReference?: SlackMessageReference;
  messageUpdateAttempted?: boolean;
  decisionClaim?: ApprovalDecision;
  memory?: OperationalMemory;
  mitigation?: LiveObstacleMitigation;
  memoryWriteStatus: "NOT_REQUIRED" | "PENDING" | "SAVED" | "FAILED";
}

interface ApprovalStore {
  records: Map<string, SlackApprovalRecord>;
  requestIdsByEvent: Map<string, string>;
}

declare global {
  var __droneSlackApprovalStore: ApprovalStore | undefined;
}

function store(): ApprovalStore {
  globalThis.__droneSlackApprovalStore ??= {
    records: new Map<string, SlackApprovalRecord>(),
    requestIdsByEvent: new Map<string, string>(),
  };
  return globalThis.__droneSlackApprovalStore;
}

export function createApprovalRecord(
  input: CreateSlackApprovalInput,
  slackConfigured: boolean,
): { record: SlackApprovalRecord; duplicate: boolean } {
  pruneExpiredRecords();
  const approvals = store();
  const existingId = approvals.requestIdsByEvent.get(input.idempotencyKey);
  const existing = existingId ? approvals.records.get(existingId) : undefined;
  if (existing) return { record: existing, duplicate: true };

  const requestId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + APPROVAL_TIMEOUT_MS);
  const status: SlackApprovalStatus = slackConfigured ? "SENDING" : "SLACK_UNAVAILABLE";
  const transport: ApprovalTransport = slackConfigured ? "SLACK" : "DEMO_FALLBACK";
  const record: SlackApprovalRecord = {
    idempotencyKey: input.idempotencyKey,
    approval: {
      requestId,
      missionId: input.missionId,
      droneName: input.droneName,
      vendorName: input.vendorName,
      approvalKind: input.approvalKind,
      currentStatus: input.currentStatus,
      coordinates: input.coordinates,
      reason: input.reason,
      risks: input.risks,
      proposedAlternative: input.proposedAlternative,
      routeImpact: input.routeImpact,
      etaImpact: input.etaImpact,
      expiresAt: expiresAt.toISOString(),
      liveObstacle: input.liveObstacle,
      memoryDraft: input.memoryDraft,
    },
    status,
    transport,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    statusMessage: slackConfigured
      ? "Sending approval request to Slack."
      : "Slack credentials are missing. Use the clearly labelled DEMO_FALLBACK controls.",
    memoryWriteStatus: "NOT_REQUIRED",
  };

  approvals.records.set(requestId, record);
  approvals.requestIdsByEvent.set(input.idempotencyKey, requestId);
  return { record, duplicate: false };
}

export function getApprovalRecord(requestId: string): SlackApprovalRecord | null {
  return store().records.get(requestId) ?? null;
}

export function markApprovalPending(
  requestId: string,
  slackReference: SlackMessageReference,
): SlackApprovalRecord | null {
  return updateRecord(requestId, (record) => ({
    ...record,
    status: "PENDING",
    transport: "SLACK",
    slackReference,
    statusMessage: "Approval requested through Slack. Waiting for an operator decision.",
  }));
}

export function markSlackApiFailed(requestId: string, message: string): SlackApprovalRecord | null {
  return updateRecord(requestId, (record) => ({
    ...record,
    status: "SLACK_API_FAILED",
    transport: "DEMO_FALLBACK",
    statusMessage: `${message} Use the clearly labelled DEMO_FALLBACK controls.`,
  }));
}

export function applyApprovalDecision(
  requestId: string,
  decision: ApprovalDecision,
  operatorName: string,
): SlackApprovalRecord | null {
  const claim = claimApprovalDecision(requestId, decision);
  if (!claim.record || !claim.claimed) return claim.record;
  return finalizeApprovalDecision(requestId, decision, operatorName);
}

export function claimApprovalDecision(
  requestId: string,
  decision: ApprovalDecision,
  mitigation?: LiveObstacleMitigation,
): { record: SlackApprovalRecord | null; claimed: boolean } {
  const current = getApprovalRecord(requestId);
  if (!current) return { record: null, claimed: false };
  const active = expireApprovalIfNeeded(current).record;
  if (active.status !== "PENDING" || active.decisionClaim) {
    return { record: active, claimed: false };
  }
  const claimed = updateRecord(requestId, (record) => ({
    ...record,
    decisionClaim: decision,
    mitigation,
    memoryWriteStatus:
      decision === "approve" && record.approval.memoryDraft
        ? "PENDING"
        : "NOT_REQUIRED",
    statusMessage:
      decision === "approve" && record.approval.memoryDraft
        ? "Operator approval received. Saving verified memory before rerouting."
        : "Operator decision received.",
  }));
  return { record: claimed, claimed: true };
}

export function finalizeApprovalDecision(
  requestId: string,
  decision: ApprovalDecision,
  operatorName: string,
  options: {
    memory?: OperationalMemory;
    memoryWriteFailed?: boolean;
    failureMessage?: string;
    mitigation?: LiveObstacleMitigation;
  } = {},
): SlackApprovalRecord | null {
  const decisionState: Record<ApprovalDecision, Pick<SlackApprovalRecord, "status" | "statusMessage">> = {
    approve: {
      status: "APPROVED",
      statusMessage: options.memory
        ? options.mitigation === "CHOOSE_ALTERNATE_ROUTE"
          ? "Alternate Route C approved. Verified hazard saved to Airtable."
          : "Altitude adjustment approved. Verified hazard saved to Airtable; Route A may continue above the crane."
        : "Agent-recommended adjustment approved. The dashboard may continue with the reviewed controls.",
    },
    hold: {
      status: "HELD",
      statusMessage: "Awaiting operator decision. The drone remains safely paused and no active memory was created.",
    },
    reject: {
      status: "REJECTED",
      statusMessage: "Operator rejected the mission. The mission is aborted and the drone remains stopped.",
    },
  };

  return updateRecord(requestId, (record) => ({
    ...record,
    ...(options.memoryWriteFailed
      ? {
          status: "HELD" as const,
          statusMessage:
            options.failureMessage ??
            "Airtable persistence failed. The drone remains holding and no reroute is authorized.",
        }
      : decision === "reject" &&
          record.approval.approvalKind === "LIVE_OBSTACLE_REROUTE"
        ? {
            status: "REJECTED" as const,
            statusMessage:
              "Operator selected Return Home. The package will not be delivered.",
          }
        : decisionState[decision]),
    operatorName,
    mitigation: options.mitigation ?? record.mitigation,
    memory: options.memory,
    memoryWriteStatus: options.memoryWriteFailed
      ? "FAILED"
      : options.memory
        ? "SAVED"
        : "NOT_REQUIRED",
  }));
}

export function expireApprovalIfNeeded(
  record: SlackApprovalRecord,
): { record: SlackApprovalRecord; justExpired: boolean } {
  if (record.status !== "PENDING" || Date.now() < new Date(record.expiresAt).getTime()) {
    return { record, justExpired: false };
  }

  const expired =
    updateRecord(record.approval.requestId, (current) => ({
      ...current,
      status: "TIMED_OUT",
      statusMessage: "No operator response arrived before the deadline. The drone remains safely paused; no approval was inferred.",
    })) ?? record;
  return { record: expired, justExpired: true };
}

export function markMessageUpdateAttempted(requestId: string): SlackApprovalRecord | null {
  return updateRecord(requestId, (record) => ({ ...record, messageUpdateAttempted: true }));
}

export function noteSlackUpdateFailure(requestId: string, message: string): SlackApprovalRecord | null {
  return updateRecord(requestId, (record) => ({
    ...record,
    statusMessage: `${record.statusMessage} Slack message update failed: ${message}`,
  }));
}

export function toApprovalApiResponse(
  record: SlackApprovalRecord,
  duplicate = false,
): SlackApprovalApiResponse {
  return {
    requestId: record.approval.requestId,
    status: record.status,
    transport: record.transport,
    missionId: record.approval.missionId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    operatorName: record.operatorName,
    statusMessage: record.statusMessage,
    duplicate,
    memory: record.memory,
    memoryWriteStatus: record.memoryWriteStatus,
    mitigation: record.mitigation,
  };
}

function updateRecord(
  requestId: string,
  updater: (record: SlackApprovalRecord) => SlackApprovalRecord,
): SlackApprovalRecord | null {
  const approvals = store();
  const current = approvals.records.get(requestId);
  if (!current) return null;
  const next = updater(current);
  approvals.records.set(requestId, next);
  return next;
}

function pruneExpiredRecords() {
  const approvals = store();
  const cutoff = Date.now() - RETENTION_MS;
  for (const [requestId, record] of approvals.records) {
    if (new Date(record.createdAt).getTime() >= cutoff) continue;
    approvals.records.delete(requestId);
    if (approvals.requestIdsByEvent.get(record.idempotencyKey) === requestId) {
      approvals.requestIdsByEvent.delete(record.idempotencyKey);
    }
  }
}

export function resetApprovalStoreForTests() {
  globalThis.__droneSlackApprovalStore = {
    records: new Map<string, SlackApprovalRecord>(),
    requestIdsByEvent: new Map<string, string>(),
  };
}

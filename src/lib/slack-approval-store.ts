import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ApprovalDecision,
  ApprovalTransport,
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
  currentStatus: string;
  coordinates: SlackApprovalMessage["coordinates"];
  reason: string;
  risks: SlackApprovalMessage["risks"];
  proposedAlternative: string;
  routeImpact: string;
  etaImpact: string;
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
      currentStatus: input.currentStatus,
      coordinates: input.coordinates,
      reason: input.reason,
      risks: input.risks,
      proposedAlternative: input.proposedAlternative,
      routeImpact: input.routeImpact,
      etaImpact: input.etaImpact,
      expiresAt: expiresAt.toISOString(),
    },
    status,
    transport,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    statusMessage: slackConfigured
      ? "Sending approval request to Slack."
      : "Slack credentials are missing. Use the clearly labelled DEMO_FALLBACK controls.",
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
  const current = getApprovalRecord(requestId);
  if (!current) return null;
  expireApprovalIfNeeded(current);
  if (current.status !== "PENDING") return current;

  const decisionState: Record<ApprovalDecision, Pick<SlackApprovalRecord, "status" | "statusMessage">> = {
    approve: {
      status: "APPROVED",
      statusMessage: "Agent-recommended adjustment approved. The dashboard may continue with the reviewed controls.",
    },
    hold: {
      status: "HELD",
      statusMessage: "Operator kept the mission on hold. The drone remains safely paused.",
    },
    reject: {
      status: "REJECTED",
      statusMessage: "Operator rejected the mission. The mission is aborted and the drone remains stopped.",
    },
  };

  return updateRecord(requestId, (record) => ({
    ...record,
    ...decisionState[decision],
    operatorName,
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

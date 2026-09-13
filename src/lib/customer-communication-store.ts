import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type {
  CustomerCommunicationSnapshot,
  CustomerCommunicationTransport,
  CustomerMessageEvent,
  CustomerMessageEventType,
  CustomerMessageStatus,
} from "@/types/domain";
import {
  validateAlternativeDropOff,
  type AlternativeDropOff,
  type AlternativeSafetyContext,
} from "@/lib/customer-dropoff-safety";

const RETENTION_MS = 6 * 60 * 60 * 1_000;

interface MissionCommunicationRecord {
  missionId: string;
  recipientE164: string | null;
  customerIdentifier: string | null;
  recipientMasked: string;
  transport: CustomerCommunicationTransport;
  primaryDropOffName: string;
  alternatives: AlternativeDropOff[];
  safetyContext: AlternativeSafetyContext | null;
  events: Map<CustomerMessageEventType, CustomerMessageEvent>;
  waitingForReply: boolean;
  replyReceived: boolean;
  selectedAlternative: AlternativeDropOff["name"] | null;
  safetyValidation: "PENDING" | "SAFE" | "UNSAFE" | null;
  safetyReason: string | null;
  updatedDropOff: AlternativeDropOff["name"] | null;
  operatorReviewRequested: boolean;
  deliveryChoiceToken: string | null;
  deliveryChoiceTokenDigest: string | null;
  deliveryChoiceTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CommunicationStore {
  records: Map<string, MissionCommunicationRecord>;
  missionIdByMessageSid: Map<string, string>;
}

declare global {
  var __droneCustomerCommunicationStore: CommunicationStore | undefined;
}

function store(): CommunicationStore {
  globalThis.__droneCustomerCommunicationStore ??= {
    records: new Map(),
    missionIdByMessageSid: new Map(),
  };
  return globalThis.__droneCustomerCommunicationStore;
}

export function registerMissionCommunication(input: {
  missionId: string;
  recipientE164: string | null;
  primaryDropOffName: string;
  alternatives: AlternativeDropOff[];
}): CustomerCommunicationSnapshot {
  pruneRecords();
  const now = new Date().toISOString();
  const existing = store().records.get(input.missionId);
  const customerIdentifier = input.recipientE164
    ? hashCustomerIdentifier(input.recipientE164)
    : null;
  const transport: CustomerCommunicationTransport = input.recipientE164
    ? "TWILIO"
    : "DEMO_FALLBACK";
  const next: MissionCommunicationRecord = existing
    ? {
        ...existing,
        recipientE164: input.recipientE164,
        customerIdentifier,
        recipientMasked: maskPhoneNumber(input.recipientE164),
        transport,
        primaryDropOffName: input.primaryDropOffName,
        alternatives: input.alternatives,
        deliveryChoiceToken:
          existing.customerIdentifier === customerIdentifier
            ? existing.deliveryChoiceToken
            : null,
        deliveryChoiceTokenDigest:
          existing.customerIdentifier === customerIdentifier
            ? existing.deliveryChoiceTokenDigest
            : null,
        deliveryChoiceTokenExpiresAt:
          existing.customerIdentifier === customerIdentifier
            ? existing.deliveryChoiceTokenExpiresAt
            : null,
        updatedAt: now,
      }
    : {
        missionId: input.missionId,
        recipientE164: input.recipientE164,
        customerIdentifier,
        recipientMasked: maskPhoneNumber(input.recipientE164),
        transport,
        primaryDropOffName: input.primaryDropOffName,
        alternatives: input.alternatives,
        safetyContext: null,
        events: new Map(),
        waitingForReply: false,
        replyReceived: false,
        selectedAlternative: null,
        safetyValidation: null,
        safetyReason: null,
        updatedDropOff: null,
        operatorReviewRequested: false,
        deliveryChoiceToken: null,
        deliveryChoiceTokenDigest: null,
        deliveryChoiceTokenExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
  store().records.set(input.missionId, next);
  return toSnapshot(next);
}

export function getMissionCommunication(
  missionId: string,
): CustomerCommunicationSnapshot | null {
  const record = store().records.get(missionId);
  return record ? toSnapshot(record) : null;
}

export function getMissionMessageContext(missionId: string): {
  recipientE164: string | null;
  customerIdentifier: string | null;
  primaryDropOffName: string;
  finalDropOffName: string;
} | null {
  const record = store().records.get(missionId);
  return record
    ? {
        recipientE164: record.recipientE164,
        customerIdentifier: record.customerIdentifier,
        primaryDropOffName: record.primaryDropOffName,
        finalDropOffName:
          record.updatedDropOff ?? record.primaryDropOffName,
      }
    : null;
}

export function reserveCustomerMessageEvent(
  missionId: string,
  eventType: CustomerMessageEventType,
): { event: CustomerMessageEvent; duplicate: boolean } | null {
  const record = store().records.get(missionId);
  if (!record) return null;
  const existing = record.events.get(eventType);
  if (existing) return { event: existing, duplicate: true };

  const event: CustomerMessageEvent = {
    eventType,
    messageSid: null,
    status: "queued",
    timestamp: new Date().toISOString(),
    transport: record.transport,
  };
  record.events.set(eventType, event);
  touch(record);
  return { event, duplicate: false };
}

export function updateCustomerMessageEvent(params: {
  missionId: string;
  eventType: CustomerMessageEventType;
  messageSid?: string | null;
  status: CustomerMessageStatus;
  transport?: CustomerCommunicationTransport;
  errorCode?: string;
}): CustomerMessageEvent | null {
  const record = store().records.get(params.missionId);
  const current = record?.events.get(params.eventType);
  if (!record || !current) return null;
  const next: CustomerMessageEvent = {
    ...current,
    messageSid: params.messageSid ?? current.messageSid,
    status: params.status,
    transport: params.transport ?? current.transport,
    errorCode: params.errorCode,
  };
  record.events.set(params.eventType, next);
  record.transport = next.transport;
  if (next.messageSid) {
    store().missionIdByMessageSid.set(next.messageSid, params.missionId);
  }
  touch(record);
  return next;
}

export function updateCustomerMessageStatusBySid(
  messageSid: string,
  status: CustomerMessageStatus,
  errorCode?: string,
): CustomerCommunicationSnapshot | null {
  const missionId = store().missionIdByMessageSid.get(messageSid);
  const record = missionId ? store().records.get(missionId) : null;
  if (!record) return null;
  for (const [eventType, event] of record.events) {
    if (event.messageSid !== messageSid) continue;
    record.events.set(eventType, { ...event, status, errorCode });
    touch(record);
    return toSnapshot(record);
  }
  return null;
}

export function beginCustomerChoiceWait(
  missionId: string,
  safetyContext: AlternativeSafetyContext,
): CustomerCommunicationSnapshot | null {
  const record = store().records.get(missionId);
  if (!record) return null;
  record.safetyContext = safetyContext;
  record.waitingForReply = true;
  record.replyReceived = false;
  record.selectedAlternative = null;
  record.safetyValidation = "PENDING";
  record.safetyReason = null;
  record.updatedDropOff = null;
  touch(record);
  return toSnapshot(record);
}

export function applyCustomerAlternativeSelection(params: {
  missionId: string;
  customerIdentifier: string;
  secureToken: string;
  selection: AlternativeDropOff["name"];
}):
  | {
      status: "ACCEPTED";
      snapshot: CustomerCommunicationSnapshot;
      decision: "SAFE" | "UNSAFE";
      reason: string;
    }
  | { status: "DUPLICATE" | "INVALID" | "NOT_WAITING" } {
  const record = store().records.get(params.missionId);
  if (
    !record ||
    record.customerIdentifier !== params.customerIdentifier ||
    !matchesDeliveryChoiceToken(record, params.secureToken)
  ) {
    return { status: "INVALID" };
  }
  if (record.replyReceived) return { status: "DUPLICATE" };
  if (!record.waitingForReply || !record.safetyContext) {
    return { status: "NOT_WAITING" };
  }
  const alternativeName = params.selection;
  const alternative = record.alternatives.find(
    (candidate) => candidate.name === alternativeName,
  );
  if (!alternative) return { status: "INVALID" };

  const decision = validateAlternativeDropOff(
    alternative,
    record.safetyContext,
  );
  record.waitingForReply = false;
  record.replyReceived = true;
  record.selectedAlternative = alternative.name;
  record.safetyValidation = decision.result;
  record.safetyReason = decision.reason;
  record.updatedDropOff =
    decision.result === "SAFE" ? alternative.name : null;
  record.operatorReviewRequested = decision.result === "UNSAFE";
  touch(record);
  return {
    status: "ACCEPTED",
    snapshot: toSnapshot(record),
    decision: decision.result,
    reason: decision.reason,
  };
}

export function saveDeliveryChoiceToken(params: {
  missionId: string;
  token: string;
  expiresAt: string;
}): boolean {
  const record = store().records.get(params.missionId);
  if (!record?.customerIdentifier) return false;
  record.deliveryChoiceToken = params.token;
  record.deliveryChoiceTokenDigest = digestToken(params.token);
  record.deliveryChoiceTokenExpiresAt = params.expiresAt;
  touch(record);
  return true;
}

export function getActiveDeliveryChoiceToken(
  missionId: string,
): { token: string; expiresAt: string } | null {
  const record = store().records.get(missionId);
  if (
    !record?.deliveryChoiceToken ||
    !record.deliveryChoiceTokenExpiresAt ||
    record.replyReceived ||
    new Date(record.deliveryChoiceTokenExpiresAt).getTime() <= Date.now()
  ) {
    return null;
  }
  return {
    token: record.deliveryChoiceToken,
    expiresAt: record.deliveryChoiceTokenExpiresAt,
  };
}

export function getDeliveryChoiceMissionState(params: {
  missionId: string;
  customerIdentifier: string;
  secureToken: string;
}): CustomerCommunicationSnapshot | null {
  const record = store().records.get(params.missionId);
  if (
    !record ||
    record.customerIdentifier !== params.customerIdentifier ||
    !matchesDeliveryChoiceToken(record, params.secureToken)
  ) {
    return null;
  }
  return toSnapshot(record);
}

export function requestCommunicationOperatorReview(
  missionId: string,
): CustomerCommunicationSnapshot | null {
  const record = store().records.get(missionId);
  if (!record) return null;
  record.waitingForReply = false;
  record.operatorReviewRequested = true;
  touch(record);
  return toSnapshot(record);
}

export function applyOperatorApprovedFallback(
  missionId: string,
  name: AlternativeDropOff["name"],
): CustomerCommunicationSnapshot | null {
  const record = store().records.get(missionId);
  if (!record) return null;
  record.selectedAlternative = name;
  record.safetyValidation = "SAFE";
  record.safetyReason =
    "Deterministic checks passed before the operator-approved DEMO_FALLBACK.";
  record.updatedDropOff = name;
  record.operatorReviewRequested = true;
  record.waitingForReply = false;
  touch(record);
  return toSnapshot(record);
}

export function getAlternativeForMission(
  missionId: string,
  name: AlternativeDropOff["name"],
): AlternativeDropOff | null {
  return (
    store()
      .records.get(missionId)
      ?.alternatives.find((alternative) => alternative.name === name) ?? null
  );
}

export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "Unavailable";
  const digits = phone.replace(/\D/g, "");
  const suffix = digits.slice(-4);
  return suffix ? `••• ••• ${suffix}` : "Unavailable";
}

export function resetCustomerCommunicationStoreForTests() {
  store().records.clear();
  store().missionIdByMessageSid.clear();
}

function toSnapshot(
  record: MissionCommunicationRecord,
): CustomerCommunicationSnapshot {
  return {
    missionId: record.missionId,
    recipientMasked: record.recipientMasked,
    transport: record.transport,
    events: [...record.events.values()],
    waitingForReply: record.waitingForReply,
    replyReceived: record.replyReceived,
    selectedAlternative: record.selectedAlternative,
    safetyValidation: record.safetyValidation,
    safetyReason: record.safetyReason,
    updatedDropOff: record.updatedDropOff,
    operatorReviewRequested: record.operatorReviewRequested,
    updatedAt: record.updatedAt,
  };
}

function touch(record: MissionCommunicationRecord) {
  record.updatedAt = new Date().toISOString();
}

function hashCustomerIdentifier(phone: string) {
  return createHash("sha256").update(phone).digest("hex").slice(0, 24);
}

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function matchesDeliveryChoiceToken(
  record: MissionCommunicationRecord,
  token: string,
) {
  if (!record.deliveryChoiceTokenDigest) return false;
  const expected = Buffer.from(record.deliveryChoiceTokenDigest);
  const supplied = Buffer.from(digestToken(token));
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

function pruneRecords() {
  const cutoff = Date.now() - RETENTION_MS;
  for (const [missionId, record] of store().records) {
    if (new Date(record.createdAt).getTime() >= cutoff) continue;
    store().records.delete(missionId);
    for (const event of record.events.values()) {
      if (event.messageSid) store().missionIdByMessageSid.delete(event.messageSid);
    }
  }
}

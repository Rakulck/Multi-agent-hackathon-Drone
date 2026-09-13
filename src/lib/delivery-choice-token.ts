import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_TTL_MS = 5 * 60 * 1_000;

interface DeliveryChoiceTokenPayload {
  version: 1;
  missionId: string;
  customerId: string;
  expiresAt: number;
  nonce: string;
}

export function createDeliveryChoiceToken(params: {
  missionId: string;
  customerId: string;
  now?: number;
}): { token: string; expiresAt: string } | null {
  const secret = signingSecret();
  if (!secret) return null;
  const now = params.now ?? Date.now();
  const payload: DeliveryChoiceTokenPayload = {
    version: 1,
    missionId: params.missionId,
    customerId: params.customerId,
    expiresAt: now + TOKEN_TTL_MS,
    nonce: randomBytes(8).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    token: `${encodedPayload}.${sign(encodedPayload, secret)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyDeliveryChoiceToken(
  token: string,
  now = Date.now(),
):
  | { ok: true; payload: DeliveryChoiceTokenPayload }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "MISSING_SECRET" } {
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "MISSING_SECRET" };
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    return { ok: false, reason: "INVALID" };
  }
  const expectedSignature = sign(encodedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return { ok: false, reason: "INVALID" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  if (!isTokenPayload(payload)) return { ok: false, reason: "INVALID" };
  if (payload.expiresAt <= now) return { ok: false, reason: "EXPIRED" };
  return { ok: true, payload };
}

function isTokenPayload(value: unknown): value is DeliveryChoiceTokenPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DeliveryChoiceTokenPayload>;
  return (
    candidate.version === 1 &&
    typeof candidate.missionId === "string" &&
    candidate.missionId.length > 0 &&
    candidate.missionId.length <= 100 &&
    typeof candidate.customerId === "string" &&
    /^[a-f0-9]{24}$/.test(candidate.customerId) &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    typeof candidate.nonce === "string" &&
    /^[A-Za-z0-9_-]{8,32}$/.test(candidate.nonce)
  );
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function signingSecret() {
  return (
    process.env.DELIVERY_CHOICE_SIGNING_SECRET ??
    process.env.TWILIO_AUTH_TOKEN ??
    process.env.TWILIO_API_KEY_SECRET ??
    null
  );
}

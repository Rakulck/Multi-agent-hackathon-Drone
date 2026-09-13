import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDeliveryChoiceToken,
  verifyDeliveryChoiceToken,
} from "@/lib/delivery-choice-token";

describe("delivery-choice signed tokens", () => {
  beforeEach(() => {
    process.env.DELIVERY_CHOICE_SIGNING_SECRET = "unit-test-secret";
  });

  afterEach(() => {
    delete process.env.DELIVERY_CHOICE_SIGNING_SECRET;
  });

  it("contains only the mission and opaque customer identifier", () => {
    const created = createDeliveryChoiceToken({
      missionId: "mission-token",
      customerId: "a".repeat(24),
      now: 1_000,
    });

    expect(created).not.toBeNull();
    const verified = verifyDeliveryChoiceToken(created!.token, 2_000);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.missionId).toBe("mission-token");
      expect(verified.payload.customerId).toBe("a".repeat(24));
      expect(verified.payload).not.toHaveProperty("phone");
    }
  });

  it("rejects tampered and expired tokens", () => {
    const created = createDeliveryChoiceToken({
      missionId: "mission-token",
      customerId: "b".repeat(24),
      now: 1_000,
    })!;

    expect(
      verifyDeliveryChoiceToken(`${created.token}tampered`, 2_000),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(verifyDeliveryChoiceToken(created.token, 301_001)).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });
});

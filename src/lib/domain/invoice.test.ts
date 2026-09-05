import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_STATES,
  deriveDisplayStatus,
  deriveEffectiveCommercialState,
  derivePaymentStatus,
  deriveSettledAfterVoid,
  isPayable,
} from "./invoice";

describe("invoice state", () => {
  const payableUntil = new Date("2026-09-10T00:00:00.000Z");
  const settlement = { blockTime: new Date("2026-09-09T12:00:00.000Z") };

  it("keeps commercial state separate from settlement-derived payment state", () => {
    expect(COMMERCIAL_STATES).toEqual(["draft", "published", "voided", "expired"]);
    expect(derivePaymentStatus(settlement)).toBe("paid");
    expect(derivePaymentStatus(null)).toBe("unpaid");
    expect(deriveDisplayStatus("published", null)).toBe("Published");
    expect(deriveDisplayStatus("voided", settlement)).toBe("Paid");
    expect(deriveDisplayStatus("expired", null)).toBe("Expired");
  });

  it("uses a half-open payable deadline", () => {
    expect(
      isPayable({
        commercialState: "published",
        settlement: null,
        now: new Date(payableUntil.getTime() - 1),
        payableUntil,
      }),
    ).toBe(true);
    expect(isPayable({ commercialState: "published", settlement: null, now: payableUntil, payableUntil })).toBe(
      false,
    );
    expect(
      isPayable({
        commercialState: "draft",
        settlement: null,
        now: new Date(payableUntil.getTime() - 1),
        payableUntil,
      }),
    ).toBe(false);
    expect(
      isPayable({
        commercialState: "published",
        settlement,
        now: new Date(payableUntil.getTime() - 1),
        payableUntil,
      }),
    ).toBe(false);
    expect(
      isPayable({
        commercialState: "published",
        settlement: null,
        now: new Date(payableUntil.getTime() + 1),
        payableUntil,
      }),
    ).toBe(false);
    expect(deriveEffectiveCommercialState("published", payableUntil, payableUntil)).toBe("expired");
    expect(
      deriveEffectiveCommercialState("published", new Date(payableUntil.getTime() - 1), payableUntil),
    ).toBe("published");
    expect(deriveEffectiveCommercialState("voided", payableUntil, payableUntil)).toBe("voided");
  });

  it("marks settlement after void only for a strictly later event", () => {
    const voidedAt = new Date("2026-09-09T12:00:00.000Z");

    expect(deriveSettledAfterVoid(null, settlement)).toBe(false);
    expect(deriveSettledAfterVoid(voidedAt, { blockTime: new Date(voidedAt.getTime() - 1) })).toBe(false);
    expect(deriveSettledAfterVoid(voidedAt, { blockTime: voidedAt })).toBe(false);
    expect(deriveSettledAfterVoid(voidedAt, { blockTime: new Date(voidedAt.getTime() + 1) })).toBe(true);
  });
});

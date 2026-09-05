export const COMMERCIAL_STATES = ["draft", "published", "voided", "expired"] as const;

export type CommercialState = (typeof COMMERCIAL_STATES)[number];
export type PaymentStatus = "unpaid" | "paid";
export type DisplayStatus = "Draft" | "Published" | "Voided" | "Expired" | "Paid";

export type SettlementFacts = Readonly<{
  blockTime: Date;
}>;

export type PayabilityFacts = Readonly<{
  commercialState: CommercialState;
  settlement: SettlementFacts | null;
  now: Date;
  payableUntil: Date;
}>;

export function derivePaymentStatus(_settlement: SettlementFacts | null): PaymentStatus {
  throw new Error("F1 implementation pending");
}

export function deriveDisplayStatus(
  _commercialState: CommercialState,
  _settlement: SettlementFacts | null,
): DisplayStatus {
  throw new Error("F1 implementation pending");
}

export function deriveEffectiveCommercialState(
  _commercialState: CommercialState,
  _now: Date,
  _payableUntil: Date,
): CommercialState {
  throw new Error("F1 implementation pending");
}

export function isPayable(_facts: PayabilityFacts): boolean {
  throw new Error("F1 implementation pending");
}

export function deriveSettledAfterVoid(_voidedAt: Date | null, _settlement: SettlementFacts): boolean {
  throw new Error("F1 implementation pending");
}

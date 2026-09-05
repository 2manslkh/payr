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

export function derivePaymentStatus(settlement: SettlementFacts | null): PaymentStatus {
  return settlement === null ? "unpaid" : "paid";
}

export function deriveDisplayStatus(
  commercialState: CommercialState,
  settlement: SettlementFacts | null,
): DisplayStatus {
  if (settlement !== null) {
    return "Paid";
  }

  const displayStatuses: Record<CommercialState, Exclude<DisplayStatus, "Paid">> = {
    draft: "Draft",
    published: "Published",
    voided: "Voided",
    expired: "Expired",
  };

  return displayStatuses[commercialState];
}

export function deriveEffectiveCommercialState(
  commercialState: CommercialState,
  now: Date,
  payableUntil: Date,
): CommercialState {
  return commercialState === "published" && now.getTime() >= payableUntil.getTime()
    ? "expired"
    : commercialState;
}

export function isPayable(facts: PayabilityFacts): boolean {
  return (
    facts.commercialState === "published" &&
    facts.settlement === null &&
    facts.now.getTime() < facts.payableUntil.getTime()
  );
}

export function deriveSettledAfterVoid(voidedAt: Date | null, settlement: SettlementFacts): boolean {
  return voidedAt !== null && settlement.blockTime.getTime() > voidedAt.getTime();
}

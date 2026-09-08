import { z } from "zod";
import type { Address, Hex } from "viem";

// Protected browser validation must not probe Function/eval under the nonce CSP.
z.config({ jitless: true });
export type PaymentReview = {
  invoiceKey: Hex; contractAddress: Address; documentCommitment: Hex; payee: Address;
  amountAtomic: string; amountDecimal: string; payableUntil: string;
};
export type WalletSettings = { projectId: string; appOrigin: string; rpcUrl: string; attestor: Address };
export type PaymentSetup = PaymentReview & WalletSettings;
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const authorizationResponseSchema = z.object({
  schemaVersion: z.literal("payr.payment-authorization.v1"), authorizationId: z.string().uuid(),
  domain: z.object({ name: z.literal("Payr"), version: z.literal("1"), chainId: z.literal(5042002), verifyingContract: address }).strict(),
  primaryType: z.literal("PayrPayment"), types: z.unknown(),
  message: z.object({ invoiceKey: hash, documentCommitment: hash, payee: address, amount: integer,
    authorizationValidUntil: integer, payableUntil: integer }).strict(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/), signerMode: z.literal("local-testnet"), network: z.literal("Arc Testnet"),
}).strict();

export const paymentStatusSchema = z.object({
  schemaVersion: z.literal("payr.public-invoice-status.v1"), invoiceVersion: z.number().int().positive(), invoiceNumber: z.string(),
  payableUntil: z.string().datetime({ offset: true }),
  commercialState: z.enum(["draft", "published", "voided", "expired"]), paymentStatus: z.enum(["unpaid", "paid"]),
  displayStatus: z.enum(["Draft", "Published", "Voided", "Expired", "Paid"]), settledAfterVoid: z.boolean(),
  settlement: z.object({ chainId: z.literal(5042002), contractAddress: address, documentCommitment: hash,
    transactionHash: hash, payee: address, amountAtomic: integer, invoiceVersion: z.number().int().positive(),
    logIndex: z.number().int().nonnegative(), blockNumber: integer, blockTime: z.string().datetime({ offset: true }),
    payer: address, amountDecimal: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/) }).strict().nullable(),
  explorer: z.object({ transactionUrl: z.string().url() }).strict().nullable(),
  receipt: z.object({ state: z.enum(["not_applicable", "pending", "rendering", "retry_wait", "ready", "failed"]),
    pageUrl: z.string().url().nullable(), pdfUrl: z.string().url().nullable(), pdfFilename: z.string().nullable(), pdfContentHash: hash.nullable() }).strict(),
  receiptEmailState: z.enum(["not_applicable", "queued", "sending", "sent", "failed", "manual_review"]),
}).strict().refine((s) => (s.paymentStatus === "paid") === (s.settlement !== null)
  && s.displayStatus === (s.settlement ? "Paid" : s.commercialState[0].toUpperCase() + s.commercialState.slice(1))
  && (!s.settledAfterVoid || (s.settlement !== null && s.commercialState === "voided"))
  && (s.receipt.state === "ready" ? Object.values(s.receipt).every((v) => v !== null)
    : s.receipt.pageUrl === null && s.receipt.pdfUrl === null && s.receipt.pdfFilename === null && s.receipt.pdfContentHash === null)
  && (s.settlement !== null || (s.receipt.state === "not_applicable" && s.receiptEmailState === "not_applicable" && s.explorer === null)));
export type PaymentStatusView = z.infer<typeof paymentStatusSchema>;

export function validatePaymentStatus(value: unknown, review: PaymentReview): PaymentStatusView {
  const status = paymentStatusSchema.parse(value);
  const s = status.settlement;
  if (Date.parse(status.payableUntil) !== Date.parse(review.payableUntil) || s && (s.contractAddress.toLowerCase() !== review.contractAddress.toLowerCase()
    || s.documentCommitment.toLowerCase() !== review.documentCommitment.toLowerCase()
    || s.payee.toLowerCase() !== review.payee.toLowerCase() || s.amountAtomic !== review.amountAtomic
    || s.invoiceVersion !== status.invoiceVersion || s.amountDecimal !== review.amountDecimal)) throw new Error("INVALID_STATUS");
  return status;
}

export class PaymentError extends Error {
  constructor(public readonly code: "WRONG_NETWORK" | "INSUFFICIENT_BALANCE" | "AUTHORIZATION_INVALID" | "AUTHORIZATION_EXPIRED" | "WALLET_CHANGED" | "PAYMENT_UNAVAILABLE") { super(code); }
}

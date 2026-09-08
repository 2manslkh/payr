import type { PaymentSetup, PaymentStatusView } from "./payment-contracts";

export const paymentSetup: PaymentSetup = { projectId: "1".repeat(32), appOrigin: "https://example.test", rpcUrl: "https://rpc.test",
  attestor: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf", invoiceKey: `0x${"2".repeat(64)}`, contractAddress: `0x${"3".repeat(40)}`,
  documentCommitment: `0x${"4".repeat(64)}`, payee: `0x${"5".repeat(40)}`, amountAtomic: "1000000000000000000",
  amountDecimal: "1", payableUntil: "2030-01-01T00:00:00Z" };
export const unpaidStatus: PaymentStatusView = { schemaVersion: "payr.public-invoice-status.v1", commercialState: "published",
  paymentStatus: "unpaid", displayStatus: "Published", settlement: null, settledAfterVoid: false, invoiceVersion: 1,
  invoiceNumber: "TEST-001", payableUntil: paymentSetup.payableUntil, explorer: null,
  receipt: { state: "not_applicable", pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null }, receiptEmailState: "not_applicable" };
export const paidStatus: PaymentStatusView = { ...unpaidStatus, paymentStatus: "paid", displayStatus: "Paid", settlement: {
  chainId: 5042002, contractAddress: paymentSetup.contractAddress, documentCommitment: paymentSetup.documentCommitment,
  transactionHash: `0x${"6".repeat(64)}`, payee: paymentSetup.payee, amountAtomic: paymentSetup.amountAtomic,
  invoiceVersion: 1, logIndex: 0, blockNumber: "100", blockTime: "2026-09-08T00:00:00Z", payer: `0x${"7".repeat(40)}`, amountDecimal: "1",
}, receipt: { ...unpaidStatus.receipt, state: "pending" }, receiptEmailState: "queued" };

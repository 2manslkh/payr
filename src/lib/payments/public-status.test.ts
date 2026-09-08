// @vitest-environment node
import { expect, it } from "vitest";
import { publicPaymentStatus } from "./public-status";
import { validatePaymentStatus } from "./payment-contracts";
import { paymentSetup, unpaidStatus, paidStatus } from "./payment.test-support";
import type { InvoiceAccessTarget } from "../documents/contracts";

it("projects the exact F5 allowlist, omitting recipient/provider/private fields at every depth", () => {
  const target = { invoiceId: "private-invoice", invoiceVersion: 1, invoiceNumber: "TEST-001", commercialState: "voided", payableUntil: paymentSetup.payableUntil,
    voidedAt: "2026-09-07T00:00:00Z", settlement: { ...paidStatus.settlement, privateSecret: "private" },
    receipt: { state: "pending", privateSecret: "private" }, deliveries: [{ roles: ["issuer"], normalizedRecipient: "private@example.test", state: "pending", providerMessageId: "provider-secret" }],
  } as unknown as InvoiceAccessTarget;
  const result = publicPaymentStatus(target, { appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", keys: new Map() }, new Date("2026-09-08T00:00:00Z"));
  expect(Object.keys(result).sort()).toEqual(Object.keys(unpaidStatus).sort());
  expect(result).toMatchObject({ paymentStatus: "paid", commercialState: "voided", settledAfterVoid: true,
    receipt: { state: "pending", pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null }, receiptEmailState: "queued" });
  expect(JSON.stringify(result)).not.toMatch(/private|provider-secret|deliveries|normalizedRecipient/);
  expect(validatePaymentStatus(result, paymentSetup)).toEqual(result);
});

it.each(["false-paid", "foreign", "recipient", "provider", "receipt", "deadline", "version"])("rejects inconsistent or non-redacted browser status: %s", (kind) => {
  const status = structuredClone(paidStatus);
  if (kind === "false-paid") status.settlement = null;
  if (kind === "foreign") status.settlement!.payee = `0x${"9".repeat(40)}`;
  if (kind === "recipient") Object.assign(status, { deliveries: [{ normalizedRecipient: "secret@example.test" }] });
  if (kind === "provider") Object.assign(status.receipt, { providerMessageId: "secret" });
  if (kind === "receipt") status.receipt.state = "ready";
  if (kind === "deadline") status.payableUntil = "2031-01-01T00:00:00Z";
  if (kind === "version") status.settlement!.invoiceVersion = 2;
  expect(() => validatePaymentStatus(status, paymentSetup)).toThrow();
});

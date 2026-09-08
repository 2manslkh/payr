import { expect, it } from "vitest";
import { settlementManagementView } from "./lifecycle";
import { testReceiptWork } from "../receipts/test-support";
import type { PublicationStatusData } from "./publication-contracts";

it("projects owner settlement/receipt/delivery proof without bearer material or recipient rows", () => {
  const { work } = testReceiptWork();
  const data: PublicationStatusData = { invoiceId: work.invoiceId, invoiceVersion: 1, invoiceNumber: work.attempt.invoiceNumber,
    commercialState: "voided", payableUntil: work.attempt.snapshot.payableUntil, voidedAt: "2030-01-01T00:00:00Z",
    snapshot: work.attempt.snapshot, attempt: work.attempt, settlement: work.settlement,
    receipt: { state: "ready", link: work.link, artifact: { pdfFilename: "receipt.pdf", pdfContentHash: work.settlement.documentCommitment } },
    deliveries: [{ roles: ["client"], normalizedRecipient: "private@example.test", state: "sent", providerMessageId: "private-provider-id", attemptCount: 1, nextAttemptAt: null }] };
  const view = settlementManagementView(data, "https://explorer.test");
  expect(view).toMatchObject({ commercialState: "voided", settledAfterVoid: true, receiptState: "ready", receiptEmailState: "sent",
    settlement: { transactionHash: work.settlement.transactionHash } });
  const json = JSON.stringify(view);
  expect(json).not.toContain(work.link.tokenId); expect(json).not.toContain(work.link.verifierHash);
  expect(json).not.toContain("private@example.test"); expect(json).not.toContain("private-provider-id");
  expect(settlementManagementView({ ...data, settlement: null }, "https://explorer.test")).toBeNull();
  for (const offset of [-1, 0, 1]) {
    const now = new Date("2030-01-03T00:00:00Z");
    expect(settlementManagementView({ ...data, commercialState: "published", voidedAt: null,
      payableUntil: new Date(now.getTime() + offset).toISOString() }, "https://explorer.test", now)?.commercialState)
      .toBe(offset <= 0 ? "expired" : "published");
  }
});

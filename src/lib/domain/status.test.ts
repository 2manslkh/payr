import { describe, expect, it } from "vitest";

import {
  buildInvoiceStatus,
  deriveReceiptEmailState,
  redactPublicInvoiceStatus,
  type InvoiceStatusFacts,
  type InvoiceStatusResult,
} from "./status";

describe("buildInvoiceStatus", () => {
  it("emits the exact explicit-null contract before settlement", () => {
    expect(
      buildInvoiceStatus({
        invoiceId: "invoice-1",
        invoiceVersion: 1,
        invoiceNumber: null,
        commercialState: "draft",
        payableUntil: null,
        now: new Date("2026-09-05T00:00:00.000Z"),
        voidedAt: null,
        settlement: null,
        explorer: null,
        invoiceDocument: null,
        receiptDocument: null,
        deliveries: [],
      }),
    ).toEqual({
      schemaVersion: "payr.invoice-status.v1",
      invoiceId: "invoice-1",
      invoiceVersion: 1,
      invoiceNumber: null,
      commercialState: "draft",
      paymentStatus: "unpaid",
      displayStatus: "Draft",
      payableUntil: null,
      settlement: null,
      explorer: null,
      settledAfterVoid: false,
      invoiceDocument: null,
      receipt: {
        state: "not_applicable",
        pageUrl: null,
        pdfUrl: null,
        pdfFilename: null,
        pdfContentHash: null,
      },
      receiptEmail: { state: "not_applicable", deliveries: [] },
    });
  });

  it("derives Paid and aggregate delivery state from settlement facts", () => {
    const facts = {
      invoiceId: "invoice-1",
      invoiceVersion: 2,
      invoiceNumber: "PAYR-2026-000001",
      commercialState: "voided",
      payableUntil: "2026-09-10T00:00:00.000Z",
      now: new Date("2026-09-11T00:00:00.000Z"),
      voidedAt: new Date("2026-09-09T11:59:59.000Z"),
      settlement: {
        chainId: 5_042_002,
        contractAddress: "0x1111111111111111111111111111111111111111",
        invoiceVersion: 2,
        transactionHash: `0x${"2".repeat(64)}`,
        logIndex: 0,
        blockNumber: "12345678901234567890",
        blockTime: "2026-09-09T12:00:00.000Z",
        payer: "0x2222222222222222222222222222222222222222",
        payee: "0x3333333333333333333333333333333333333333",
        amountDecimal: "1.23",
        amountAtomic: "1230000000000000000",
        documentCommitment: `0x${"4".repeat(64)}`,
      },
      explorer: { transactionUrl: "https://testnet.arcscan.app/tx/0x2" },
      invoiceDocument: null,
      receiptDocument: {
        state: "ready",
        pageUrl: "https://payrlink.xyz/receipt/example",
        pdfUrl: "https://payrlink.xyz/receipt/example/pdf",
        pdfFilename: "receipt.pdf",
        pdfContentHash: `0x${"5".repeat(64)}`,
      },
      deliveries: [
        {
          roles: ["issuer"],
          normalizedRecipient: "issuer@example.test",
          state: "sent",
          providerMessageId: "message-1",
          attemptCount: 1,
          nextAttemptAt: null,
        },
        {
          roles: ["client"],
          normalizedRecipient: "client@example.test",
          state: "manual_review",
          providerMessageId: null,
          attemptCount: 2,
          nextAttemptAt: null,
        },
      ],
    } satisfies InvoiceStatusFacts;
    const status = buildInvoiceStatus(facts);

    expect(status.paymentStatus).toBe("paid");
    expect(status.displayStatus).toBe("Paid");
    expect(status.commercialState).toBe("voided");
    expect(status.settledAfterVoid).toBe(true);
    expect(status.settlement).toEqual(facts.settlement);
    expect(status.explorer).toEqual(facts.explorer);
    expect(status.receipt).toEqual(facts.receiptDocument);
    expect(status.receiptEmail.state).toBe("manual_review");
    expect(status.receiptEmail.deliveries).toEqual(facts.deliveries);

    expect(buildInvoiceStatus({ ...facts, receiptDocument: { state: "rendering" } }).receipt).toEqual({
      state: "rendering",
      pageUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      pdfContentHash: null,
    });
  });

  it.each([
    [false, [], "not_applicable"],
    [false, ["manual_review"], "not_applicable"],
    [true, [], "queued"],
    [true, ["sent", "sent"], "sent"],
    [true, ["sent", "pending"], "queued"],
    [true, ["retry_wait"], "queued"],
    [true, ["retry_wait", "sending"], "sending"],
    [true, ["sending", "failed"], "failed"],
    [true, ["failed", "manual_review"], "manual_review"],
  ] as const)("aggregates settlement %s and delivery states %j as %s", (hasSettlement, states, expected) => {
    expect(deriveReceiptEmailState(hasSettlement, states.map((state) => ({ state })))).toBe(expected);
  });

  it("projects effective expiry before a sweep persists it", () => {
    const facts = {
      invoiceId: "invoice-1",
      invoiceVersion: 1,
      invoiceNumber: "PAYR-2026-000001",
      commercialState: "published",
      payableUntil: "2026-09-10T00:00:00.000Z",
      now: new Date("2026-09-10T00:00:00.000Z"),
      voidedAt: null,
      settlement: null,
      explorer: null,
      invoiceDocument: null,
      receiptDocument: null,
      deliveries: [],
    } satisfies InvoiceStatusFacts;
    const status = buildInvoiceStatus(facts);

    expect(status.commercialState).toBe("expired");
    expect(status.displayStatus).toBe("Expired");
    expect(
      buildInvoiceStatus({ ...facts, now: new Date("2026-09-09T23:59:59.999Z") }).commercialState,
    ).toBe("published");
  });

  it("projects public status through an exact whitelist", () => {
    const status = {
      schemaVersion: "payr.invoice-status.v1",
      invoiceId: "private-invoice-id",
      invoiceVersion: 2,
      invoiceNumber: "PAYR-2026-000001",
      commercialState: "published",
      paymentStatus: "paid",
      displayStatus: "Paid",
      payableUntil: "2026-09-10T00:00:00.000Z",
      settlement: {
        chainId: 5_042_002,
        contractAddress: "0x1111111111111111111111111111111111111111",
        invoiceVersion: 2,
        transactionHash: `0x${"2".repeat(64)}`,
        logIndex: 0,
        blockNumber: "123",
        blockTime: "2026-09-09T12:00:00.000Z",
        payer: "0x2222222222222222222222222222222222222222",
        payee: "0x3333333333333333333333333333333333333333",
        amountDecimal: "1.23",
        amountAtomic: "1230000000000000000",
        documentCommitment: `0x${"4".repeat(64)}`,
      },
      explorer: { transactionUrl: "https://testnet.arcscan.app/tx/0x2" },
      settledAfterVoid: false,
      invoiceDocument: {
        state: "ready",
        pageUrl: "https://payrlink.xyz/invoice/private",
        pdfUrl: "https://payrlink.xyz/invoice/private/pdf",
        pdfFilename: "invoice.pdf",
        pdfContentHash: `0x${"6".repeat(64)}`,
      },
      receipt: {
        state: "ready",
        pageUrl: "https://payrlink.xyz/receipt/example",
        pdfUrl: "https://payrlink.xyz/receipt/example/pdf",
        pdfFilename: "receipt.pdf",
        pdfContentHash: `0x${"5".repeat(64)}`,
      },
      receiptEmail: {
        state: "sent",
        deliveries: [
          {
            roles: ["client"],
            normalizedRecipient: "private@example.test",
            state: "sent",
            providerMessageId: "private-provider-id",
            attemptCount: 1,
            nextAttemptAt: null,
          },
        ],
      },
    } satisfies InvoiceStatusResult;

    expect(redactPublicInvoiceStatus(status)).toEqual({
      schemaVersion: "payr.public-invoice-status.v1",
      invoiceVersion: 2,
      invoiceNumber: "PAYR-2026-000001",
      commercialState: "published",
      paymentStatus: "paid",
      displayStatus: "Paid",
      payableUntil: "2026-09-10T00:00:00.000Z",
      settlement: status.settlement,
      explorer: status.explorer,
      settledAfterVoid: false,
      receipt: status.receipt,
      receiptEmailState: "sent",
    });
  });

  it("rejects unpublished or incomplete status from the public projection", () => {
    const status = buildInvoiceStatus({
      invoiceId: "private-invoice-id",
      invoiceVersion: 1,
      invoiceNumber: "PAYR-2026-000001",
      commercialState: "published",
      payableUntil: "2026-09-10T00:00:00.000Z",
      now: new Date("2026-09-09T00:00:00.000Z"),
      voidedAt: null,
      settlement: null,
      explorer: null,
      invoiceDocument: null,
      receiptDocument: null,
      deliveries: [],
    });

    expect(() => redactPublicInvoiceStatus({ ...status, invoiceNumber: null })).toThrow();
    expect(() => redactPublicInvoiceStatus({ ...status, payableUntil: null })).toThrow();
    expect(() =>
      redactPublicInvoiceStatus({ ...status, commercialState: "draft", displayStatus: "Draft" }),
    ).toThrow();
  });
});

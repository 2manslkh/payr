import { expect, it } from "vitest";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { buildPublishedInvoiceView } from "./invoice-view";
import type { CanonicalInvoiceDocument } from "./contracts";

it("formats one immutable invoice view without private provenance or self-referential proof", () => {
  const document: CanonicalInvoiceDocument = {
    schemaVersion: "payr.invoice-document.v1", invoiceId: "00000000-0000-4000-8000-000000000003",
    invoiceVersion: 1, invoiceNumber: "INV-2030-000001", invoiceKey: `0x${"3".repeat(64)}`,
    chainId: 5042002, contractAddress: `0x${"4".repeat(40)}`, invoice: testPublicationSnapshot(),
  };
  const view = buildPublishedInvoiceView(document, "https://example.test/invoice/test-only");
  expect(view).toMatchObject({ invoiceNumber: "INV-2030-000001", amountDecimal: "1.23", asset: "USDC", network: "Arc",
    sender: { businessName: "Test & Studio", addressLines: ["1 Test Road", "London", "N1 1AA", "GB"] },
    invoiceUrl: "https://example.test/invoice/test-only", payoutWallet: `0x${"2".repeat(40)}` });
  for (const field of ["invoiceId", "clientProvenance", "proposedClientChanges", "publicationSalt", "documentCommitment", "pdfContentHash"]) {
    expect(Object.hasOwn(view, field)).toBe(false);
  }
});

import { expect, it } from "vitest";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { buildPublishedInvoiceView, parseCanonicalInvoiceDocument } from "./invoice-view";
import { DocumentVerificationError, type CanonicalInvoiceDocument } from "./contracts";
import { canonicalJson } from "../domain/canonical-json";

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

it("accepts only the exact canonical publication schema and preserves all 18 decimal places", () => {
  const invoice = testPublicationSnapshot();
  invoice.items = [{ description: "Exact work", amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001" }];
  Object.assign(invoice, { amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001" });
  invoice.sender = { ...invoice.sender, billingAddress: { line1: "1 Test Road", city: "London", postalCode: "N1 1AA",
    countryCode: "GB", line2: "Floor 2", region: "Greater London" } };
  const document: CanonicalInvoiceDocument = {
    schemaVersion: "payr.invoice-document.v1", invoiceId: "00000000-0000-4000-8000-000000000003",
    invoiceVersion: 7, invoiceNumber: "INV-2030-000001", invoiceKey: `0x${"3".repeat(64)}`,
    chainId: 5042002, contractAddress: `0x${"4".repeat(40)}`, invoice,
  };
  const json = canonicalJson(document);
  expect(parseCanonicalInvoiceDocument(json)).toEqual(document);
  const view = buildPublishedInvoiceView(parseCanonicalInvoiceDocument(json), "https://example.test/invoice/test-only");
  expect(view).toEqual({ invoiceNumber: "INV-2030-000001", invoiceVersion: 7,
    issueDate: "2030-01-01", dueDate: "2030-01-31", payableUntil: "2030-03-02T00:00:00.000Z",
    sender: { businessName: "Test & Studio", contactName: "Owner", contactEmail: "owner@example.test",
      addressLines: ["1 Test Road", "Floor 2", "London", "Greater London", "N1 1AA", "GB"] },
    client: { businessName: "Test Client", contactName: "Client", contactEmail: "client@example.test",
      addressLines: ["1 Test Road", "London", "N1 1AA", "GB"] }, items: invoice.items,
    amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001", memo: "",
    payoutWallet: `0x${"2".repeat(40)}`, asset: "USDC", network: "Arc", invoiceUrl: "https://example.test/invoice/test-only" });
  view.items[0].description = "Changed view";
  expect(document.invoice.items[0].description).toBe("Exact work");
  for (const invalid of ["{", ` ${json}`, JSON.stringify(document), json.replace('"chainId":5042002', '"chainId":5042002,"chainId":5042002'),
    canonicalJson({ ...document, publicationSalt: "not-allowed" }),
    canonicalJson({ ...document, schemaVersion: "payr.invoice-document.v2" }),
    canonicalJson({ ...document, invoiceVersion: 0 }), canonicalJson({ ...document, chainId: 0 }),
    canonicalJson({ ...document, contractAddress: `0x${"0".repeat(40)}` }),
    canonicalJson({ ...document, invoice: { ...invoice, amountAtomic: "100" } }),
    canonicalJson({ ...document, invoice: { ...invoice, ignoredField: "not-allowed" } }),
    canonicalJson({ ...document, invoice: { ...invoice, dueDate: "2029-01-01" } }),
  ]) expect(() => parseCanonicalInvoiceDocument(invalid)).toThrow(DocumentVerificationError);
});

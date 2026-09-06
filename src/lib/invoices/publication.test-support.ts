import { encodeAbiParameters, keccak256, toHex } from "viem";
import type { DraftSnapshot, InvoiceDocumentPort } from "./contracts";

export function testPublicationSnapshot(): DraftSnapshot {
  const address = { line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB" };
  return {
    schemaVersion: "payr.draft.v1",
    sender: { id: "00000000-0000-4000-8000-000000000001", revision: 1, businessName: "Test & Studio",
      billingAddress: address, contactName: "Owner", contactEmail: "owner@example.test", payoutWallet: `0x${"2".repeat(40)}`, invoicePrefix: "INV", defaultPaymentTermsDays: 30 },
    client: { businessName: "Test Client", billingAddress: address, contactName: "Client", contactEmail: "client@example.test" },
    clientReference: { id: "00000000-0000-4000-8000-000000000002", alias: "client", revision: 1 },
    clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "saved_profile" }, contactEmail: { kind: "saved_profile" } },
    proposedClientChanges: { kind: "none", fields: {} },
    items: [{ description: "Confirmed work", amountDecimal: "1.23", amountAtomic: "1230000000000000000" }],
    issueDate: "2030-01-01", dueDate: "2030-01-31", payableUntil: "2030-03-02T00:00:00.000Z",
    amountDecimal: "1.23", amountAtomic: "1230000000000000000", memo: "",
    appliedDefaults: [{ field: "payableUntil", value: "2030-03-02T00:00:00.000Z", source: "technical_deadline" }],
  };
}

// Test-only create/read adapter. This is not a PDF renderer or a production storage implementation.
export function createTestDocumentPort(objects = new Map<string, Uint8Array>()): InvoiceDocumentPort {
  return { async createOrRead(input) {
    if (!objects.has(input.storageKey)) objects.set(input.storageKey, new TextEncoder().encode(
      `%PDF-1.7\n${JSON.stringify({ canonicalInvoiceJson: input.canonicalInvoiceJson, invoiceNumber: input.invoiceNumber, invoiceUrl: input.invoiceUrl })}\n%%EOF`,
    ));
    const bytes = new Uint8Array(objects.get(input.storageKey)!);
    const stored = JSON.parse(new TextDecoder().decode(bytes).slice(9, -6));
    const invoiceDataHash = keccak256(toHex(stored.canonicalInvoiceJson as string));
    const pdfContentHash = keccak256(bytes);
    const documentCommitment = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }], [input.publicationSalt, invoiceDataHash, pdfContentHash],
    ));
    return { bytes, contentType: "application/pdf", byteLength: bytes.byteLength, invoiceDataHash, pdfContentHash, documentCommitment, decodedQrDestination: stored.invoiceUrl };
  } };
}

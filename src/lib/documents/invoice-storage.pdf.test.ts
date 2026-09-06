// @vitest-environment node
import { expect, it, vi } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { computeDocumentCommitment } from "../domain/commitment";
import { DocumentVerificationError, type CanonicalInvoiceDocument, type PublishedInvoiceView } from "./contracts";
import { renderInvoicePdf } from "./invoice-pdf";
import { createInvoiceDocumentPort } from "./invoice-storage";
import { buildPublishedInvoiceView } from "./invoice-view";
import { longTestInvoiceDocument, testInvoiceDocument, testInvoiceUrl } from "./pdf-test-utils";
import { inspectInvoicePdf } from "./pdf-verification";

const document = testInvoiceDocument();
const input = {
  storageKey: `workspace/00000000-0000-4000-8000-000000000010/invoice/${document.invoiceId}/${document.invoiceVersion}/attempt/00000000-0000-4000-8000-000000000020.pdf`,
  canonicalInvoiceJson: canonicalJson(document), invoiceNumber: document.invoiceNumber,
  invoiceUrl: testInvoiceUrl, publicationSalt: `0x${"4".repeat(64)}` as const,
};

it("accepts the actual stored PDF bytes without requiring a newly rendered byte match", async () => {
  const rendered = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl));
  const bytes = new Uint8Array([...rendered, ...new TextEncoder().encode("\n% stored artifact, not a new render\n")]);
  const create = vi.fn();
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create },
    { storageState: async () => "stored" });
  const result = await port.createOrRead(input);
  expect(result.bytes).toBe(bytes);
  expect(bytes).not.toEqual(rendered);
  expect(result).toMatchObject({ ...computeDocumentCommitment(input.canonicalInvoiceJson, bytes, input.publicationSalt), decodedQrDestination: testInvoiceUrl });
  expect(create).not.toHaveBeenCalled();
}, 30000);

it.each<{ name: string; change(view: PublishedInvoiceView): void; printed: string }>([
  { name: "total 11.23 instead of 1.23", change: (view) => { view.amountDecimal = "11.23"; }, printed: "Totaldue11.23USDC" },
  { name: "item 11.23 instead of 1.23", change: (view) => { view.items[0].amountDecimal = "11.23"; }, printed: "Confirmedwork11.23USDC" },
  { name: "wrong total atomic count", change: (view) => { view.amountAtomic = "11230000000000000000"; }, printed: "Totaldue1.23USDC11230000000000000000atomicunits" },
  { name: "wrong item atomic count", change: (view) => { view.items[0].amountAtomic = "11230000000000000000"; }, printed: "Confirmedwork1.23USDC11230000000000000000atomicunits" },
])("rejects a real PDF collision with $name despite the exact QR and other facts", async ({ change, printed }) => {
  const wrong = buildPublishedInvoiceView(document, testInvoiceUrl);
  change(wrong);
  const bytes = await renderInvoicePdf(wrong);
  const inspection = await inspectInvoicePdf(bytes);
  expect(inspection.qrDestinations).toEqual([testInvoiceUrl]);
  expect(inspection.text.replace(/\s+/g, "")).toContain(printed);
  const create = vi.fn();
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create },
    { storageState: async () => "stored" });
  const outcome = await port.createOrRead(input).then(() => null, (error) => error);
  expect(outcome).toEqual(new DocumentVerificationError());
  expect(create).not.toHaveBeenCalled();
}, 30000);

function multipleItems(): CanonicalInvoiceDocument {
  const document = testInvoiceDocument();
  document.invoice.items = [
    { description: "Implementation work", amountDecimal: "1.23", amountAtomic: "1230000000000000000" },
    { description: "Review work", amountDecimal: "2.34", amountAtomic: "2340000000000000000" },
    { description: "Review work", amountDecimal: "2.34", amountAtomic: "2340000000000000000" },
  ];
  document.invoice.amountDecimal = "5.91";
  document.invoice.amountAtomic = "5910000000000000000";
  return document;
}

it.each<{ name: string; change(view: PublishedInvoiceView): void }>([
  { name: "swapped item decimal amounts", change(view) {
    [view.items[0].amountDecimal, view.items[1].amountDecimal] = [view.items[1].amountDecimal, view.items[0].amountDecimal];
  } },
  { name: "swapped item atomic counts", change(view) {
    [view.items[0].amountAtomic, view.items[1].amountAtomic] = [view.items[1].amountAtomic, view.items[0].amountAtomic];
  } },
  { name: "swapped complete amounts between descriptions", change(view) {
    [view.items[0], view.items[1]] = [{ ...view.items[1], description: view.items[0].description }, { ...view.items[0], description: view.items[1].description }];
  } },
  { name: "a deduplicated identical item", change(view) { view.items.pop(); } },
  { name: "an additional duplicate item", change(view) { view.items.push({ ...view.items[2] }); } },
  { name: "replacement of a repeated row by another existing row", change(view) { view.items[2] = { ...view.items[0] }; } },
])("rejects a real exact-QR PDF with $name", async ({ change }) => {
  const document = multipleItems(), wrong = buildPublishedInvoiceView(document, testInvoiceUrl);
  change(wrong);
  const bytes = await renderInvoicePdf(wrong), inspection = await inspectInvoicePdf(bytes);
  expect(inspection.qrDestinations).toEqual([testInvoiceUrl]);
  const create = vi.fn();
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create },
    { storageState: async () => "stored" });
  const outcome = await port.createOrRead({ ...input, canonicalInvoiceJson: canonicalJson(document) }).then(() => null, (error) => error);
  expect(outcome).toEqual(new DocumentVerificationError());
  expect(create).not.toHaveBeenCalled();
}, 30000);

it("accepts exact repeated items without deduplicating their amounts", async () => {
  const document = multipleItems(), bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl));
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create: vi.fn() },
    { storageState: async () => "stored" });
  expect((await port.createOrRead({ ...input, canonicalInvoiceJson: canonicalJson(document) })).bytes).toBe(bytes);
}, 30000);

it("accepts exact decimal and atomic digits split across real PDF lines", async () => {
  const document = testInvoiceDocument();
  document.invoice.amountDecimal = "1234567890123456789012345678901234567890.123456789012345678";
  document.invoice.amountAtomic = "1234567890123456789012345678901234567890123456789012345678";
  document.invoice.items = [{ description: "Confirmed work", amountDecimal: document.invoice.amountDecimal, amountAtomic: document.invoice.amountAtomic }];
  const bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl));
  const inspection = await inspectInvoicePdf(bytes);
  expect(inspection.qrDestinations).toEqual([testInvoiceUrl]);
  expect(inspection.text).toMatch(/123456789012345678901234567890\s+1234567890\.123456789012345678/);
  expect(inspection.text).toMatch(/123456789012345678901234567890\s+1234567890123456789012345678 atomic units/);
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create: vi.fn() },
    { storageState: async () => "stored" });
  expect((await port.createOrRead({ ...input, canonicalInvoiceJson: canonicalJson(document) })).bytes).toBe(bytes);
}, 30000);

it("accepts all 100 ordered items across real page footers and wrapped material fields", async () => {
  const document = longTestInvoiceDocument(), bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl));
  const inspection = await inspectInvoicePdf(bytes);
  expect(inspection.pageCount).toBeGreaterThan(1);
  expect(inspection.qrDestinations).toEqual([testInvoiceUrl]);
  const port = createInvoiceDocumentPort({ read: async () => ({ bytes, byteLength: bytes.length, contentType: "application/pdf" }), create: vi.fn() },
    { storageState: async () => "stored" });
  expect((await port.createOrRead({ ...input, canonicalInvoiceJson: canonicalJson(document) })).bytes).toBe(bytes);
}, 60000);

// @vitest-environment node
import { expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { buildPublishedInvoiceView } from "./invoice-view";
import { invoiceQrDataUrl, renderInvoicePdf } from "./invoice-pdf";
import { inspectInvoicePdf } from "./pdf-verification";
import { longTestInvoiceDocument, rasterizeTestPdf, testInvoiceDocument, testInvoiceUrl } from "./pdf-test-utils";
import { DocumentUnavailableError, DocumentVerificationError } from "./contracts";

it("keeps operational QR failures retryable through the renderer without changing invoice validation errors", async () => {
  const failure = vi.spyOn(QRCode, "toDataURL").mockImplementation(() => { throw new Error("test-only QR runtime failure"); });
  try {
    await expect(invoiceQrDataUrl(testInvoiceUrl)).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(renderInvoicePdf(buildPublishedInvoiceView(testInvoiceDocument(), testInvoiceUrl)))
      .rejects.toBeInstanceOf(DocumentUnavailableError);
  } finally { failure.mockRestore(); }
});

it("renders immutable commercial facts and the exact 18-decimal amount with a visible payment-page QR", async () => {
  const document = testInvoiceDocument();
  document.invoice.memo = 'Literal <script>alert("test")</script> & no remote assets.';
  document.invoice.items = [{ description: "Exact engineering work", amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001" }];
  document.invoice.amountDecimal = "1.000000000000000001";
  document.invoice.amountAtomic = "1000000000000000001";
  const view = buildPublishedInvoiceView(document, testInvoiceUrl);
  const bytes = await renderInvoicePdf(view);
  expect(bytes.byteLength).toBeLessThanOrEqual(10485760);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const inspected = await inspectInvoicePdf(bytes);
  expect(inspected.pageCount).toBe(1);
  expect(inspected.qrDestinations).toEqual([testInvoiceUrl]);
  const text = inspected.text.replace(/\s+/g, " ");
  const facts = [view.invoiceNumber, `Version ${view.invoiceVersion}`, view.issueDate, view.dueDate, view.payableUntil,
    ...[view.sender, view.client].flatMap((party) => [party.businessName, party.contactName, party.contactEmail, ...party.addressLines]),
    ...view.items.flatMap((item) => [item.description, `Line amount: ${item.amountDecimal} ${view.asset}`, `Atomic units: ${item.amountAtomic} atomic units`]),
    `Total due ${view.amountDecimal} ${view.asset}`, `Atomic units: ${view.amountAtomic} atomic units`,
    view.memo, view.payoutWallet, view.asset, view.network, view.invoiceUrl];
  for (const fact of facts) expect(text).toContain(fact);
  for (const privateField of [document.invoiceId, document.invoiceKey, "publicationSalt", "pdfContentHash", "documentCommitment", "tax compliant"]) {
    expect(text).not.toContain(privateField);
  }
}, 20000);

it("paginates 100 long items, long names, multiline addresses and the complete wallet without clipping facts", async () => {
  const view = buildPublishedInvoiceView(longTestInvoiceDocument(), testInvoiceUrl);
  const start = performance.now();
  const bytes = await renderInvoicePdf(view), rendered = performance.now();
  const inspected = await inspectInvoicePdf(bytes), verified = performance.now();
  expect(inspected.pageCount).toBeGreaterThan(1);
  expect(inspected.pageCount).toBeLessThanOrEqual(24);
  expect(inspected.qrDestinations).toEqual([testInvoiceUrl]);
  const compact = (text: string) => text.replace(/\s+/g, "");
  const text = compact(inspected.text);
  expect(text.split("Lineamount:").length - 1).toBe(100);
  expect(text.split("Atomicunits:").length - 1).toBe(101);
  for (const fact of [view.invoiceNumber, view.payoutWallet, view.memo, view.invoiceUrl, view.amountDecimal, view.amountAtomic,
    ...[view.sender, view.client].flatMap((party) => [party.businessName, party.contactName, party.contactEmail, ...party.addressLines]),
    ...view.items.map((item) => item.description)]) expect(text.includes(compact(fact)), "material fact parity").toBe(true);
  const pages = await rasterizeTestPdf(bytes);
  for (const page of pages) for (const item of page.text.filter((item) => item.str.trim())) {
    expect(item.transform[4], "left edge").toBeGreaterThanOrEqual(40);
    expect(item.transform[4] + item.width, "right edge").toBeLessThanOrEqual(page.width - 40);
    expect(item.transform[5], "bottom edge").toBeGreaterThanOrEqual(20);
    expect(item.transform[5] + item.height, "top edge").toBeLessThanOrEqual(page.height - 36);
  }
  // Safe performance evidence only; never log invoice URLs, snapshots, or bytes.
  console.info(JSON.stringify({ benchmark: "100-item invoice", pages: inspected.pageCount, bytes: bytes.byteLength,
    renderMs: Math.round(rendered - start), rasterQrMs: Math.round(verified - rendered), totalMs: Math.round(verified - start) }));
}, 40000);

it("keeps a maximum-width exact amount and a long noncredential URL within the page and decodes that URL", async () => {
  const document = testInvoiceDocument();
  const amountDecimal = "115792089237316195423570985008687907853269984665640564039457.584007913129639935";
  const amountAtomic = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  document.invoice.items = [{ description: "Largest exact amount", amountDecimal, amountAtomic }];
  Object.assign(document.invoice, { amountDecimal, amountAtomic });
  const url = `https://example.test/invoice/test-only-${"abcdefghijklmnopqrstuvwxyz0123456789".repeat(12)}`;
  const bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, url));
  const inspected = await inspectInvoicePdf(bytes);
  expect(inspected.qrDestinations).toEqual([url]);
  for (const fact of [amountDecimal, amountAtomic, url]) expect(inspected.text.replace(/\s+/g, "").includes(fact)).toBe(true);
  for (const page of await rasterizeTestPdf(bytes)) for (const item of page.text.filter((item) => item.str.trim())) {
    expect(item.transform[4]).toBeGreaterThanOrEqual(40);
    expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 40);
  }
}, 20000);

it("fails closed on unsupported Helvetica glyphs, control characters and unbounded render inputs", async () => {
  const view = buildPublishedInvoiceView(testInvoiceDocument(), testInvoiceUrl);
  for (const memo of ["Thai: \u0e01", "Emoji: \ud83d\ude00", "Accent: \u00e9", "Hidden\u200btext", "Control\u0000text", "x".repeat(2001)]) {
    await expect(renderInvoicePdf({ ...view, memo })).rejects.toBeInstanceOf(DocumentVerificationError);
  }
  await expect(renderInvoicePdf({ ...view, items: Array(101).fill(view.items[0]) })).rejects.toBeInstanceOf(DocumentVerificationError);
  for (const url of ["javascript:alert(1)", "https://example.test/invoice/test-only#fragment",
    "https://example.test/invoice/test-only?query", "https://user:password@example.test/invoice/test-only",
    `https://example.test/invoice/${"a".repeat(512)}`]) {
    await expect(invoiceQrDataUrl(url)).rejects.toBeInstanceOf(DocumentVerificationError);
  }
});

it("uses issue-date metadata, not retry time, without embedding the PDF's own hash or commitment", async () => {
  const view = buildPublishedInvoiceView(testInvoiceDocument(), testInvoiceUrl);
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"));
    const first = await renderInvoicePdf(view);
    vi.setSystemTime(new Date("2050-12-31T23:59:59.000Z"));
    expect(await renderInvoicePdf(view)).toEqual(first);
    const raw = Buffer.from(first).toString("latin1");
    expect(raw).toContain("D:20300101000000Z");
    expect(raw).not.toMatch(/D:2040|D:2050/);
  } finally { vi.useRealTimers(); }
}, 20000);

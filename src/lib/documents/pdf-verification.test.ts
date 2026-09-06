// @vitest-environment node
import { expect, it, vi } from "vitest";
import { inspectInvoicePdf } from "./pdf-verification";
import { fixturePdf, rawFixturePdf, testInvoiceUrl } from "./pdf-test-utils";
import { DocumentVerificationError } from "./contracts";

it("extracts text and decodes the QR from actual PDF page pixels without consuming the input bytes", async () => {
  const bytes = await fixturePdf({ destinations: [testInvoiceUrl] });
  const original = bytes.slice();
  const result = await inspectInvoicePdf(bytes);
  expect(result.pageCount).toBe(1);
  expect(result.qrDestinations).toEqual([testInvoiceUrl]);
  expect(result.text).toContain(`Fixture page 1. ${testInvoiceUrl}`);
  expect(bytes).toEqual(original);
}, 20000);

it("rejects PDF JavaScript and external streams without returning their contents or resource URLs", async () => {
  const text = "BT /F1 10 Tf 42 780 Td (Safe fixture text) Tj ET";
  for (const bytes of [
    rawFixturePdf(text, { catalog: `/OpenAction << /S /JavaScript /JS (fetch\\('${testInvoiceUrl}'\\)) >>` }),
    rawFixturePdf("", { stream: `/F << /FS /URL /F (${testInvoiceUrl}) >>` }),
  ]) await expect(inspectInvoicePdf(bytes)).rejects.toMatchObject({ name: "DocumentVerificationError", message: "ARTIFACT_VERIFICATION_FAILED" });
});

it("terminates in-flight real inspection at the wall-clock budget", async () => {
  const bytes = await fixturePdf({ destinations: [testInvoiceUrl] });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const result = inspectInvoicePdf(bytes).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20001);
    expect(await result).toBeInstanceOf(DocumentVerificationError);
  } finally { vi.useRealTimers(); }
});

it("bounds drawing operators before native rasterization", async () => {
  const bytes = rawFixturePdf("q Q\n".repeat(50001) + "BT /F1 10 Tf 42 780 Td (Safe fixture) Tj ET");
  await expect(inspectInvoicePdf(bytes)).rejects.toBeInstanceOf(DocumentVerificationError);
});

it("rejects annotation appearances rather than decoding content underneath an omitted viewer overlay", async () => {
  const bytes = rawFixturePdf("BT /F1 10 Tf 42 780 Td (Safe fixture) Tj ET", {
    page: "/Annots [<< /Type /Annot /Subtype /Square /Rect [0 0 595 842] /F 4 /IC [1 1 1] /C [1 1 1] >>]",
  });
  await expect(inspectInvoicePdf(bytes)).rejects.toBeInstanceOf(DocumentVerificationError);
});

it("reports both visible codes, including duplicates, rather than accepting the first code on a page", async () => {
  for (const other of ["https://example.test/invoice/wrong-test-only", testInvoiceUrl]) {
    const result = await inspectInvoicePdf(await fixturePdf({ destinations: [testInvoiceUrl, other] }));
    expect(result.qrDestinations.sort()).toEqual([testInvoiceUrl, other].sort());
  }
}, 20000);

it("does not mistake text, metadata, hidden images, or corrupt QR pixels for a visible destination", async () => {
  for (const placement of ["offpage", "covered", "corrupt"] as const) {
    const result = await inspectInvoicePdf(await fixturePdf({ destinations: [testInvoiceUrl], placement }));
    expect(result.text).toContain(testInvoiceUrl);
    expect(result.qrDestinations).toEqual([]);
  }
  expect((await inspectInvoicePdf(await fixturePdf())).qrDestinations).toEqual([]);
  expect((await inspectInvoicePdf(await fixturePdf({ destinations: ["https://example.test/invoice/wrong-test-only"] })))
    .qrDestinations).toEqual(["https://example.test/invoice/wrong-test-only"]);
}, 20000);

it("rejects malformed, oversized, excessive-page and excessive-raster PDFs with only a sanitized error", async () => {
  const tooLarge = new Uint8Array(10485761);
  tooLarge.set(new TextEncoder().encode("%PDF-1.7"));
  const invalid = [new Uint8Array(), new TextEncoder().encode("%PDF-https://example.test/invoice/test-only"), tooLarge,
    await fixturePdf({ pages: 25 }), await fixturePdf({ size: [3000, 3000] }),
    await fixturePdf({ size: [1100, 1100] })];
  for (const bytes of invalid) {
    await expect(inspectInvoicePdf(bytes)).rejects.toMatchObject({ name: "DocumentVerificationError", message: "ARTIFACT_VERIFICATION_FAILED" });
    await expect(inspectInvoicePdf(bytes)).rejects.toBeInstanceOf(DocumentVerificationError);
  }
}, 20000);

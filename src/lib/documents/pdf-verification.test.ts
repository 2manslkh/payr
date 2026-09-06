// @vitest-environment node
import { expect, it, vi } from "vitest";
import { Worker } from "node:worker_threads";
import { inspectInvoicePdf } from "./pdf-verification";
import { fixturePdf, longTestInvoiceDocument, probePackagedInvoicePdf, rawFixturePdf, resourceFixturePdf, testInvoiceDocument, testInvoiceUrl } from "./pdf-test-utils";
import { DocumentUnavailableError, DocumentVerificationError } from "./contracts";
import { buildPublishedInvoiceView } from "./invoice-view";
import { renderInvoicePdf } from "./invoice-pdf";

it.runIf(!!process.env.PAYR_TEST_PDF_PACKAGE_DIR).each([1, 18])(
  "inspects a real %s-page invoice through the compiled factory using only isolated production trace files", async (pageCount) => {
    const document = pageCount === 1 ? testInvoiceDocument() : longTestInvoiceDocument();
    const bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl));
    const result = await probePackagedInvoicePdf(process.env.PAYR_TEST_PDF_PACKAGE_DIR!, undefined, bytes);
    expect(result).toMatchObject({ pageCount, qrDestinations: [testInvoiceUrl] });
  }, 40000);

it.runIf(!!process.env.PAYR_TEST_PDF_PACKAGE_DIR).each(["missing-jsqr", "broken-worker", "missing-font", "missing-native"] as const)(
  "keeps packaged %s failures retryable instead of burning an invoice number", async (fault) => {
    expect(await probePackagedInvoicePdf(process.env.PAYR_TEST_PDF_PACKAGE_DIR!, fault))
      .toEqual({ name: "DocumentUnavailableError", message: "DOCUMENT_UNAVAILABLE" });
  }, 40000);

it("bounds a compressed content stream and aggregate images before PDF.js allocates decoded resources", async () => {
  for (const bytes of [resourceFixturePdf({ decodedBytes: 4 * 1024 * 1024 + 1 }), resourceFixturePdf({ count: 80, images: true })]) {
    await expect(inspectInvoicePdf(bytes)).rejects.toBeInstanceOf(DocumentVerificationError);
  }
}, 20000);

it.runIf(!!process.env.PAYR_TEST_PDF_PACKAGE_DIR)("rejects the 1024-stream expansion case before loading even a broken PDF worker", async () => {
  // Only one 1 MiB source block is allocated to build this ~1 MiB compressed
  // fixture. A broken bootstrap prevents an old inspector from inflating 1 GiB.
  const bytes = resourceFixturePdf({ count: 1024, decodedBytes: 1024 * 1024 });
  expect(await probePackagedInvoicePdf(process.env.PAYR_TEST_PDF_PACKAGE_DIR!, "broken-worker", bytes))
    .toEqual({ name: "DocumentVerificationError", message: "ARTIFACT_VERIFICATION_FAILED" });
}, 40000);

it.runIf(!!process.env.PAYR_TEST_PDF_PACKAGE_DIR)("rejects inline image operators nested in arrays before PDF parser bootstrap", async () => {
  const bytes = rawFixturePdf("[BI /W 1 /H 1 /BPC 8 /CS /DeviceGray ID \u0000 EI] TJ");
  expect(await probePackagedInvoicePdf(process.env.PAYR_TEST_PDF_PACKAGE_DIR!, "broken-worker", bytes))
    .toEqual({ name: "DocumentVerificationError", message: "ARTIFACT_VERIFICATION_FAILED" });
}, 40000);

it.runIf(!!process.env.PAYR_TEST_PDF_PACKAGE_DIR).each(["content references", "image draws"])(
  "bounds repeated %s before PDF parser bootstrap", async (kind) => {
    const bytes = resourceFixturePdf(kind === "content references"
      ? { decodedBytes: 1024 * 1024, repeatedContents: 1024 } : { images: true, repeatedDrawing: 80 });
    expect(await probePackagedInvoicePdf(process.env.PAYR_TEST_PDF_PACKAGE_DIR!, "broken-worker", bytes))
      .toEqual({ name: "DocumentVerificationError", message: "ARTIFACT_VERIFICATION_FAILED" });
  }, 40000);

it.each([
  "/Filter /Flate#44ecode", "/#46ilter /FlateDecode", "/Filter [/FlateDecode]", "/Filter /Fl",
  "/Filter /FlateDecode /Filter /FlateDecode", "/Filter /FlateDecode /DecodeParms null",
  "/Filter /FlateDecode /DecodeParms << /Predictor 1 >>", "/Filter /FlateDecode /DP << /Predictor 1 >>",
])("rejects ambiguous or unsupported stream decoding: %s", async (filter) => {
  await expect(inspectInvoicePdf(resourceFixturePdf({ filter }))).rejects.toBeInstanceOf(DocumentVerificationError);
});

it("bounds aggregate inflation even when each content stream fits the individual limit", async () => {
  await expect(inspectInvoicePdf(resourceFixturePdf({ count: 20, decodedBytes: 1024 * 1024 })))
    .rejects.toBeInstanceOf(DocumentVerificationError);
});

it("does not confuse ordinary literal text with PDF resource syntax", async () => {
  const text = "Filter DecodeParms FlateDecode BI ID EI";
  const result = await inspectInvoicePdf(rawFixturePdf(`BT /F1 10 Tf 42 780 Td (${text}) Tj ET`));
  expect(result.text).toContain(text);
});

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

it.each(["timeout", "error"])("awaits real worker termination before settling a worker %s as retryable", async (mode) => {
  const bytes = await fixturePdf({ destinations: [testInvoiceUrl] });
  let confirmTermination!: () => void, release!: () => void;
  const terminated = new Promise<void>((resolve) => { confirmTermination = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const terminate = Worker.prototype.terminate;
  const once = Worker.prototype.once;
  const fault = vi.spyOn(Worker.prototype, "once").mockImplementation(function (this: Worker, event, listener) {
    const result = once.call(this, event, listener);
    if (mode === "error" && event === "error") queueMicrotask(() => this.emit("error", new Error("test-only internal worker failure")));
    return result;
  });
  const spy = vi.spyOn(Worker.prototype, "terminate").mockImplementation(async function (this: Worker) {
    const code = await terminate.call(this);
    confirmTermination();
    await released;
    return code;
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    let settled = false;
    const result = inspectInvoicePdf(bytes).catch((error: unknown) => error).then((value) => { settled = true; return value; });
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(20001);
    await terminated;
    expect(settled).toBe(false);
    release();
    expect(await result).toBeInstanceOf(DocumentUnavailableError);
  } finally { release(); spy.mockRestore(); fault.mockRestore(); vi.useRealTimers(); }
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

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { DocumentVerificationError, type PdfInspection } from "./contracts";

// A module worker keeps PDF parsing, native rasterization and QR CPU work off the
// request thread. A Promise timeout alone cannot interrupt a hostile PDF parser.
// This literal is self-contained JS so it works without a runtime TS loader.
const inspectionWorker = String.raw`
import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
let unsupported = false;
const deny = () => { unsupported = true; throw new Error("Unsupported PDF resource"); };
globalThis.fetch = deny;
globalThis.XMLHttpRequest = class { constructor() { deny(); } };
console.log = console.warn = console.error = () => { unsupported = true; };
try {
  const { createCanvas, DOMMatrix, Path2D, ImageData } = await import(workerData.canvas);
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  const pdfjs = await import(workerData.pdfjs);
  globalThis.pdfjsWorker = await import(workerData.pdfWorker);
  const { default: jsQR } = await import(workerData.jsqr);
  // PDF.js 6 removed generated font/function evaluation. Also deny the globals;
  // no PDF scripting/sandbox or XFA viewer is loaded by this inspector.
  globalThis.eval = globalThis.Function = deny;
  let allocatedPixels = 0;
  class BoundedCanvasFactory {
    create(width, height) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
          width > 4096 || height > 4096 || width * height > 4000000 ||
          (allocatedPixels += width * height) > 128000000) deny();
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(target, width, height) {
      this.destroy(target);
      Object.assign(target, this.create(width, height));
    }
    destroy(target) { target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
  }
  let resourceBytes = 0, resourceCount = 0;
  class LocalFontsOnly {
    async fetch({ kind, filename }) {
      if (kind !== "standardFontDataUrl" || ![
        "LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf",
        "FoxitSerif.pfb", "FoxitSerifBold.pfb", "FoxitSerifItalic.pfb", "FoxitSerifBoldItalic.pfb",
        "FoxitFixed.pfb", "FoxitFixedBold.pfb", "FoxitFixedItalic.pfb", "FoxitFixedBoldItalic.pfb",
        "FoxitSymbol.pfb", "FoxitDingbats.pfb",
      ].includes(filename) || ++resourceCount > 16) deny();
      const bytes = await readFile(new URL("standard_fonts/" + filename, workerData.pdfPackage));
      if ((resourceBytes += bytes.length) > 2000000) deny();
      return new Uint8Array(bytes);
    }
  }
  const loading = pdfjs.getDocument({ data: workerData.bytes, verbosity: 1, stopAtErrors: true,
    useWorkerFetch: false, useWasm: false, isEvalSupported: false, enableXfa: false,
    disableAutoFetch: true, disableStream: true, disableRange: true,
    useSystemFonts: false, disableFontFace: true, isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false, maxImageSize: 4000000, canvasMaxAreaInBytes: 16000000,
    CanvasFactory: BoundedCanvasFactory, BinaryDataFactory: LocalFontsOnly });
  const pdf = await loading.promise;
  const qrDestinations = [], text = [];
  let pixels = 0, characters = 0, operators = 0;
  if (pdf.numPages < 1 || pdf.numPages > 24 || pdf.isPureXfa) deny();
  if (await pdf.getJSActions() || await pdf.getFieldObjects() || await pdf.getAttachments()) deny();
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 2 });
    // The generated invoice has no annotations. Reject viewer-only appearances
    // rather than proving a QR that a stamp/widget could cover in the viewer.
    if (await page.getJSActions() || (await page.getAnnotations()).length) deny();
    const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
        width > 4096 || height > 4096 || width * height > 4000000 ||
        (pixels += width * height) > 48000000) deny();
    const list = await page.getOperatorList();
    if ((operators += list.fnArray.length) > 100000) deny();
    const content = await page.getTextContent();
    const pageText = content.items.filter(item => "str" in item).map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
    if ((characters += pageText.length) > 200000) deny();
    text.push(pageText);
    const factory = new BoundedCanvasFactory(), target = factory.create(width, height);
    await page.render({ canvas: target.canvas, canvasContext: target.context, viewport,
      background: "rgb(255,255,255)", annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
    // Overlapping raster tiles avoid finder-pattern confusion between adjacent
    // identical QRs. Tiles are page pixels, never extracted image resources.
    const regions = [[0, 0, width, height]];
    const tileWidth = Math.ceil(width / 2), tileHeight = Math.ceil(height / 2);
    for (const y of [0, Math.floor(height / 4), height - tileHeight]) {
      for (const x of [0, Math.floor(width / 4), width - tileWidth]) regions.push([x, y, tileWidth, tileHeight]);
    }
    for (;;) {
      let code, offsetX, offsetY;
      for (const [x, y, w, h] of regions) {
        const image = target.context.getImageData(x, y, w, h);
        code = jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" });
        if (code) { offsetX = x; offsetY = y; break; }
      }
      if (!code) break;
      if (qrDestinations.length >= 8 || code.data.length > 2048) deny();
      qrDestinations.push(code.data);
      // Remove only this decoded quadrilateral from the page raster and scan
      // again. Do not deduplicate: two identical visible codes are still two.
      const corners = [code.location.topLeftCorner, code.location.topRightCorner,
        code.location.bottomRightCorner, code.location.bottomLeftCorner];
      target.context.fillStyle = "white";
      target.context.beginPath();
      corners.forEach((point, index) => index ? target.context.lineTo(point.x + offsetX, point.y + offsetY)
        : target.context.moveTo(point.x + offsetX, point.y + offsetY));
      target.context.closePath();
      target.context.fill();
    }
    factory.destroy(target);
    page.cleanup();
  }
  if (unsupported || !text.some(value => value.trim())) deny();
  const result = { pageCount: pdf.numPages, qrDestinations, text: text.join("\n") };
  await loading.destroy();
  parentPort.postMessage(result);
} catch { parentPort.postMessage(null); }
`;

export async function inspectInvoicePdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 5 || bytes.byteLength > 10485760
    || ![37, 80, 68, 70, 45].every((value, index) => bytes[index] === value)) throw new DocumentVerificationError();
  try {
    const require = createRequire(import.meta.url);
    const resolve = (name: string) => pathToFileURL(require.resolve(name)).href;
    const copy = new Uint8Array(bytes);
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(inspectionWorker)}`), {
      workerData: { bytes: copy, canvas: resolve("@napi-rs/canvas"), jsqr: resolve("jsqr"),
        pdfjs: resolve("pdfjs-dist/legacy/build/pdf.mjs"), pdfWorker: resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
        pdfPackage: resolve("pdfjs-dist/package.json") },
      transferList: [copy.buffer], execArgv: [], env: {}, stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    // Discard worker diagnostics, which can otherwise contain PDF-controlled text.
    worker.stdout.resume(); worker.stderr.resume();
    return await new Promise<PdfInspection>((resolve, reject) => {
      let finished = false;
      const finish = (result?: PdfInspection | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        void worker.terminate();
        if (result) resolve(result); else reject(new DocumentVerificationError());
      };
      const timer = setTimeout(() => finish(), 20000);
      worker.once("message", (result: PdfInspection | null) => finish(result));
      worker.once("error", () => finish());
      worker.once("exit", () => finish());
    });
  } catch { throw new DocumentVerificationError(); }
}

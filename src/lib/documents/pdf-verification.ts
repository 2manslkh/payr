import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { DocumentUnavailableError, DocumentVerificationError, type PdfInspection } from "./contracts";

// A module worker keeps PDF parsing, native rasterization and QR CPU work off the
// request thread. A Promise timeout alone cannot interrupt a hostile PDF parser.
// This literal is self-contained JS so it works without a runtime TS loader.
const inspectionWorker = String.raw`
import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
let unsupported = false, unavailable = false, runtimeReady = false;
class InvalidPdf extends Error {}
const deny = () => { unsupported = true; throw new InvalidPdf(); };
globalThis.fetch = deny;
globalThis.XMLHttpRequest = class { constructor() { deny(); } };
console.log = console.warn = console.error = () => { unsupported = true; };

// Restricted PDFKit producer profile, not a general-purpose PDF validator.
// Parse the entire classic-xref envelope, then bound EVERY stream and image
// before importing PDF.js. Heap limits do not cover decoded ArrayBuffers.
function preflight(bytes) {
  const binary = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const source = binary.toString("latin1"), references = [], streams = new Map(), objects = new Map();
  let tokens = 0, stringBytes = 0;
  class Reader {
    constructor(source) { this.source = source; this.pos = 0; }
    skip() {
      while (this.pos < this.source.length) {
        if (/[\x00\t\n\f\r ]/.test(this.source[this.pos])) this.pos++;
        else if (this.source[this.pos] === "%") {
          while (this.pos < this.source.length && !/[\r\n]/.test(this.source[this.pos])) this.pos++;
        } else break;
      }
    }
    word() {
      this.skip();
      const start = this.pos;
      while (this.pos < this.source.length && !/[\x00\t\n\f\r ()<>\[\]{}/%]/.test(this.source[this.pos])) this.pos++;
      if (start === this.pos || this.pos - start > 128) deny();
      return this.source.slice(start, this.pos);
    }
    value(depth = 0, content = false) {
      if (++tokens > 200000 || depth > 16) deny();
      this.skip();
      const start = this.pos, char = this.source[this.pos++];
      if (char === "<" && this.source[this.pos] === "<") {
        if (content) deny();
        this.pos++;
        const value = new Map();
        for (;;) {
          this.skip();
          if (this.source.startsWith(">>", this.pos)) { this.pos += 2; return value; }
          const key = this.value(depth + 1);
          if (!key?.name || value.has(key.name)) deny();
          value.set(key.name, this.value(depth + 1));
        }
      }
      if (char === "[") {
        const value = [];
        for (;;) {
          this.skip();
          if (this.source[this.pos] === "]") { this.pos++; return value; }
          if (value.length >= 2048) deny();
          value.push(this.value(depth + 1, content));
        }
      }
      if (char === "/") {
        if (!/[A-Za-z0-9_.+-]/.test(this.source[this.pos] ?? "")) deny();
        const name = this.word();
        // No #xx escapes, abbreviations, or alternate spellings from this producer.
        if (!/^[A-Za-z0-9_.+-]+$/.test(name)) deny();
        return { name };
      }
      if (char === "(") {
        let nesting = 1;
        while (nesting && this.pos < this.source.length) {
          const next = this.source[this.pos++];
          if (next === "\\") this.pos++;
          else if (next === "(") { if (++nesting > 32) deny(); }
          else if (next === ")") nesting--;
          if (this.pos - start > 65536) deny();
        }
        if (nesting || this.pos > this.source.length) deny();
        if (content && (stringBytes += this.pos - start) > 200000) deny();
        return { string: true };
      }
      if (char === "<") {
        const end = this.source.indexOf(">", this.pos);
        if (end < 0 || end - this.pos > 131072 || !/^[0-9A-Fa-f\x00\t\n\f\r ]*$/.test(this.source.slice(this.pos, end))) deny();
        if (content && (stringBytes += Math.ceil((end - this.pos) / 2)) > 200000) deny();
        this.pos = end + 1;
        return { string: true };
      }
      this.pos = start;
      const word = this.word();
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
        const number = Number(word);
        if (!Number.isFinite(number) || Math.abs(number) > 1000000000) deny();
        const ref = /^[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+R(?=[\x00\t\n\f\r /\[\]<>%]|$)/.exec(this.source.slice(this.pos, this.pos + 64));
        if (ref) {
          if (content || !Number.isInteger(number) || number < 1 || number > 2048 || ref[1] !== "0") deny();
          this.pos += ref[0].length; references.push(number);
          return { ref: number };
        }
        return number;
      }
      if (["true", "false", "null"].includes(word)) return word === "null" ? null : word === "true";
      if (content && depth === 0) return { operator: word };
      deny();
    }
  }
  if (!/^%PDF-1\.[3-7]\r?\n/.test(source)) deny();
  const reader = new Reader(source);
  for (;;) {
    reader.skip();
    if (source.startsWith("xref", reader.pos)) break;
    const offset = reader.pos, id = Number(reader.word());
    if (!Number.isInteger(id) || id < 1 || id > 2048 || objects.has(id) || reader.word() !== "0" || reader.word() !== "obj") deny();
    const value = reader.value();
    objects.set(id, { offset, value });
    reader.skip();
    if (source.startsWith("stream", reader.pos)) {
      const length = value instanceof Map ? value.get("Length") : undefined;
      if (!Number.isInteger(length) || length < 0 || streams.size >= 128) deny();
      const start = /^stream\r?\n/.exec(source.slice(reader.pos, reader.pos + 9));
      if (!start) deny();
      reader.pos += start[0].length;
      const data = binary.subarray(reader.pos, reader.pos + length);
      if (data.length !== length) deny();
      reader.pos += length;
      const end = /^\r?\nendstream(?=[\x00\t\n\f\r ])/.exec(source.slice(reader.pos, reader.pos + 14));
      if (!end) deny();
      reader.pos += end[0].length;
      streams.set(id, { dictionary: value, data });
    }
    if (reader.word() !== "endobj") deny();
  }
  const xref = reader.pos;
  if (reader.word() !== "xref" || reader.word() !== "0" || Number(reader.word()) !== objects.size + 1) deny();
  for (let id = 0; id <= objects.size; id++) {
    const offset = reader.word(), generation = reader.word(), flag = reader.word();
    if (!/^\d{10}$/.test(offset) || Number(offset) !== (id ? objects.get(id)?.offset : 0)
        || generation !== (id ? "00000" : "65535") || flag !== (id ? "n" : "f")) deny();
  }
  if (reader.word() !== "trailer") deny();
  const trailer = reader.value();
  if (!(trailer instanceof Map) || [...trailer.keys()].some(key => !["Size", "Root", "Info", "ID"].includes(key))
      || trailer.get("Size") !== objects.size + 1 || reader.word() !== "startxref" || Number(reader.word()) !== xref
      || !/^[\x00\t\n\f\r ]*%%EOF[\x00\t\n\f\r ]*$/.test(source.slice(reader.pos))
      || references.some(id => !objects.has(id))) deny();
  const dictionary = value => {
    const result = value?.ref ? objects.get(value.ref)?.value : value;
    if (!(result instanceof Map)) deny();
    return result;
  };
  const only = (dict, keys) => { if ([...dict.keys()].some(key => !keys.includes(key))) deny(); };
  const name = (dict, key) => dict.get(key)?.name;
  const walk = value => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!(value instanceof Map)) return;
    for (const [key, child] of value) {
      if (["DecodeParms", "DP", "F", "FFilter", "FDecodeParms", "Encrypt", "Prev", "XRefStm", "ToUnicode",
        "FontDescriptor", "FontFile", "FontFile2", "FontFile3", "CharProcs", "Shading", "Pattern", "FunctionType",
        "XFA", "AcroForm", "OpenAction", "AA", "JavaScript", "JS", "EmbeddedFiles", "Annots", "Mask"].includes(key)) deny();
      walk(child);
    }
    if (value.has("Type") && !["Catalog", "Pages", "Page", "Font", "XObject", "ExtGState"].includes(name(value, "Type"))) deny();
    if (name(value, "Type") === "Font" || value.has("BaseFont")) {
      only(value, ["Type", "Subtype", "BaseFont", "Encoding"]);
      if (name(value, "Type") !== "Font" || name(value, "Subtype") !== "Type1"
          || !["Helvetica", "Helvetica-Bold", "Courier"].includes(name(value, "BaseFont"))
          || value.has("Encoding") && name(value, "Encoding") !== "WinAnsiEncoding") deny();
    } else if (value.has("Subtype") && name(value, "Subtype") !== "Image") deny();
    if (name(value, "Type") === "ExtGState") {
      only(value, ["Type", "ca", "CA"]);
      for (const key of ["ca", "CA"]) if (value.has(key) && !(value.get(key) >= 0 && value.get(key) <= 1)) deny();
    }
    if (value.has("Filter") && name(value, "Filter") !== "FlateDecode") deny();
  };
  for (const { value } of objects.values()) walk(value);
  let imagePixels = 0;
  for (const { dictionary: dict } of streams.values()) {
    if (name(dict, "Subtype") === "Image") {
      only(dict, ["Type", "Subtype", "Length", "Filter", "Width", "Height", "BitsPerComponent", "ColorSpace", "SMask", "Decode"]);
      const width = dict.get("Width"), height = dict.get("Height");
      if (name(dict, "Type") !== "XObject" || name(dict, "Filter") !== "FlateDecode" || dict.get("BitsPerComponent") !== 8
          || !["DeviceGray", "DeviceRGB"].includes(name(dict, "ColorSpace")) || !Number.isInteger(width) || !Number.isInteger(height)
          || width < 1 || height < 1 || width > 4096 || height > 4096 || (imagePixels += width * height) > 4000000) deny();
      if (dict.has("Decode") && (name(dict, "ColorSpace") !== "DeviceGray" || JSON.stringify(dict.get("Decode")) !== "[0,1]")) deny();
      if (dict.has("SMask")) {
        const mask = dictionary(dict.get("SMask"));
        if (!streams.has(dict.get("SMask")?.ref) || name(mask, "Subtype") !== "Image" || name(mask, "ColorSpace") !== "DeviceGray"
            || mask.has("SMask") || mask.get("Width") !== width || mask.get("Height") !== height) deny();
      }
    } else only(dict, ["Length", "Filter"]);
  }
  const catalog = dictionary(trailer.get("Root")), pages = dictionary(catalog.get("Pages")), kids = pages.get("Kids");
  only(catalog, ["Type", "Pages", "Names", "ViewerPreferences", "Lang"]);
  if (name(catalog, "Type") !== "Catalog" || name(pages, "Type") !== "Pages" || !Array.isArray(kids)
      || kids.length < 1 || kids.length > 24 || pages.get("Count") !== kids.length || new Set(kids.map(kid => kid?.ref)).size !== kids.length) deny();
  only(pages, ["Type", "Count", "Kids"]);
  let pagePixels = 0;
  const contentOwners = new Map();
  for (const kid of kids) {
    const page = dictionary(kid), box = page.get("MediaBox");
    only(page, ["Type", "Parent", "MediaBox", "Contents", "Resources", "UserUnit"]);
    if (name(page, "Type") !== "Page" || page.get("Parent")?.ref !== catalog.get("Pages")?.ref
        || page.has("UserUnit") && page.get("UserUnit") !== 1 || !Array.isArray(box) || box.length !== 4
        || box[0] !== 0 || box[1] !== 0 || !box.every(value => typeof value === "number") || box[2] <= 0 || box[3] <= 0) deny();
    const width = Math.ceil(box[2] * 2), height = Math.ceil(box[3] * 2);
    if (width > 4096 || height > 4096 || width * height > 4000000 || (pagePixels += width * height) > 48000000) deny();
    const content = page.get("Contents"), parts = Array.isArray(content) ? content : [content];
    if (!parts.length || parts.some(part => !streams.has(part?.ref) || name(streams.get(part.ref).dictionary, "Subtype") === "Image")) deny();
    const resources = dictionary(page.get("Resources"));
    // Repeated references can expand one bounded stream into an unbounded
    // StreamsSequenceStream. The producer emits distinct page-content objects.
    for (const part of parts) {
      if (contentOwners.has(part.ref)) deny();
      contentOwners.set(part.ref, resources);
    }
    only(resources, ["ProcSet", "Font", "ExtGState", "XObject", "ColorSpace"]);
    if (resources.has("ColorSpace") && dictionary(resources.get("ColorSpace")).size) deny();
    for (const [key, type] of [["Font", "Font"], ["ExtGState", "ExtGState"], ["XObject", "XObject"]]) {
      if (!resources.has(key)) continue;
      const entries = dictionary(resources.get(key));
      if (key === "Font" && entries.size > 16) deny();
      for (const ref of entries.values()) {
        const target = dictionary(ref);
        if (name(target, "Type") !== type || type === "XObject" && (!streams.has(ref?.ref) || name(target, "Subtype") !== "Image")) deny();
      }
    }
  }
  let decodedBytes = 0, operators = 0, imageDrawPixels = 0;
  const allowedOperators = new Set("q Q cm w J j M d ri i gs m l c v y h re S s f F f* B B* b b* n W W* BT ET Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ ' \" Do CS cs SC SCN sc scn G g RG rg K k".split(" "));
  for (const [id, { dictionary: dict, data }] of streams) {
    const maximum = Math.min(4194304, 16777216 - decodedBytes);
    if (maximum < 1) deny();
    let decoded = data;
    if (dict.has("Filter")) {
      try {
        const result = inflateSync(data, { maxOutputLength: maximum, info: true });
        if (result.engine.bytesWritten !== data.length) deny();
        decoded = result.buffer;
      } catch (error) {
        if (error instanceof InvalidPdf || ["ERR_BUFFER_TOO_LARGE", "Z_DATA_ERROR", "Z_BUF_ERROR", "Z_NEED_DICT"].includes(error?.code)) deny();
        throw error;
      }
    }
    if (decoded.length > maximum) deny();
    decodedBytes += decoded.length;
    if (name(dict, "Subtype") === "Image") {
      if (decoded.length !== dict.get("Width") * dict.get("Height") * (name(dict, "ColorSpace") === "DeviceRGB" ? 3 : 1)) deny();
      continue;
    }
    const content = new Reader(decoded.toString("latin1"));
    let saves = 0, inText = false, operand;
    for (;;) {
      content.skip();
      if (content.pos === content.source.length) break;
      const value = content.value(0, true), op = value?.operator;
      if (!op) { operand = value; continue; }
      if (!allowedOperators.has(op) || ++operators > 100000) deny();
      if (op === "Do") {
        const images = contentOwners.get(id)?.get("XObject");
        if (!images || !operand?.name) deny();
        const image = dictionary(dictionary(images).get(operand.name));
        if (name(image, "Subtype") !== "Image" || (imageDrawPixels += image.get("Width") * image.get("Height")
            * (image.has("SMask") ? 2 : 1)) > 4000000) deny();
      }
      operand = undefined;
      if (op === "q" && ++saves > 64 || op === "Q" && --saves < 0) deny();
      if (op === "BT") { if (inText) deny(); inText = true; }
      if (op === "ET") { if (!inText) deny(); inText = false; }
    }
    if (saves || inText) deny();
  }
}
try {
  preflight(workerData.bytes);
  // Resolve inside native Node, not in code Turbopack rewrites. The deployment
  // root and explicit next.config traces are the worker's entire module path.
  const require = createRequire(workerData.moduleRoot + "/package.json");
  const resolve = name => pathToFileURL(require.resolve(name)).href;
  const pdfPackage = resolve("pdfjs-dist/package.json");
  const { createCanvas, DOMMatrix, Path2D, ImageData } = await import(resolve("@napi-rs/canvas"));
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  const pdfjs = await import(resolve("pdfjs-dist/legacy/build/pdf.mjs"));
  globalThis.pdfjsWorker = await import(resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"));
  const { default: jsQR } = await import(resolve("jsqr"));
  if (typeof createCanvas !== "function" || typeof pdfjs.getDocument !== "function" || typeof jsQR !== "function"
      || !globalThis.pdfjsWorker.WorkerMessageHandler) throw new Error("PDF runtime unavailable");
  runtimeReady = true;
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
      let bytes;
      try { bytes = await readFile(new URL("standard_fonts/" + filename, pdfPackage)); }
      catch { unavailable = true; throw new Error("PDF font unavailable"); }
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
  const qrDestinations = [], text = [], textItems = [];
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
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const measured = { page: number, text: item.str, x: item.transform[4], y: viewport.height / 2 - item.transform[5],
        width: item.width, height: item.height };
      if (textItems.length >= 10000 || ![measured.x, measured.y, measured.width, measured.height]
          .every(value => Number.isFinite(value) && Math.abs(value) <= 1000000)
          || measured.width < 0 || measured.height <= 0) deny();
      textItems.push(measured);
    }
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
        if (code && !code.data.length && !code.binaryData.length && !code.chunks.length) {
          code = undefined;
          continue;
        }
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
  if (unavailable) throw new Error("PDF resources unavailable");
  if (unsupported || !text.some(value => value.trim())) deny();
  const result = { pageCount: pdf.numPages, qrDestinations, text: text.join("\n"), textItems };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2097152) deny();
  await loading.destroy();
  parentPort.postMessage({ status: "ok", inspection: result });
} catch (error) {
  const invalid = error instanceof InvalidPdf || runtimeReady &&
    ["InvalidPDFException", "FormatError", "PasswordException", "UnknownErrorException"].includes(error?.name);
  parentPort.postMessage({ status: !unavailable && invalid ? "invalid" : "unavailable" });
}
`;

type WorkerResult = { status: "ok"; inspection: PdfInspection } | { status: "invalid" | "unavailable" };

export async function inspectInvoicePdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 5 || bytes.byteLength > 10485760
    || ![37, 80, 68, 70, 45].every((value, index) => bytes[index] === value)) throw new DocumentVerificationError();
  try {
    // A literal resolution anchors the native dependency graph in NFT. Its
    // compiled value is an opaque module ID, NOT a filesystem path; only the
    // worker's native Node resolver may supply paths to dynamic import.
    const require = createRequire(import.meta.url);
    const copy = new Uint8Array(bytes);
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(inspectionWorker)}`), {
      workerData: { bytes: copy, moduleRoot: process.cwd(), canvasTraceAnchor: require.resolve("@napi-rs/canvas") },
      transferList: [copy.buffer], execArgv: [], env: {}, stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    // Discard worker diagnostics, which can otherwise contain PDF-controlled text.
    worker.stdout.resume(); worker.stderr.resume();
    return await new Promise<PdfInspection>((resolve, reject) => {
      let finished = false;
      const finish = async (result?: WorkerResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { await worker.terminate(); }
        catch { reject(new DocumentUnavailableError()); return; }
        if (result?.status === "ok") resolve(result.inspection);
        else reject(result?.status === "invalid" ? new DocumentVerificationError() : new DocumentUnavailableError());
      };
      const timer = setTimeout(() => { void finish(); }, 45000);
      worker.once("message", (result: WorkerResult) => { void finish(result); });
      worker.once("error", () => { void finish(); });
      worker.once("exit", () => { void finish(); });
    });
  } catch (error) {
    if (error instanceof DocumentVerificationError) throw error;
    throw new DocumentUnavailableError();
  }
}

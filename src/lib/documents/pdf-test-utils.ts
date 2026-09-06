import { createElement as h } from "react";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import QRCode from "qrcode";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { CanonicalInvoiceDocument } from "./contracts";
import { buildPublishedInvoiceView } from "./invoice-view";
import { renderInvoicePdf } from "./invoice-pdf";
import { inspectInvoicePdf } from "./pdf-verification";

// Noncredential fixtures only. Never use a real access link in retained test evidence.
export const testInvoiceUrl = "https://example.test/invoice/test-only";
export function testInvoiceDocument(): CanonicalInvoiceDocument {
  return { schemaVersion: "payr.invoice-document.v1", invoiceId: "00000000-0000-4000-8000-000000000003",
    invoiceVersion: 7, invoiceNumber: "INV-2030-000001", invoiceKey: `0x${"3".repeat(64)}`,
    chainId: 5042002, contractAddress: `0x${"4".repeat(40)}`, invoice: testPublicationSnapshot() };
}

export function longTestInvoiceDocument(): CanonicalInvoiceDocument {
  const document = testInvoiceDocument(), invoice = document.invoice;
  invoice.sender = { ...invoice.sender, businessName: "Independent engineering and verification studio ".repeat(4).trim(),
    contactName: "A long confirmed issuer contact name for the commercial record",
    billingAddress: { line1: "W".repeat(190), line2: "Building B\nFloor 12, Suite 123", city: "A long metropolitan district name",
      region: "The confirmed administrative region", postalCode: "AB12 3CD", countryCode: "GB" } };
  invoice.client = { ...invoice.client, businessName: "Client research and delivery operations ".repeat(5).trim(),
    billingAddress: { line1: "A long client street address including the building and the confirmed billing department",
      line2: "Office 456\nAccounts payable", city: "Client city", region: "Client region", postalCode: "98765", countryCode: "US" } };
  invoice.items = Array.from({ length: 100 }, (_, index) => ({
    description: (`Line ${String(index + 1).padStart(3, "0")}: ` + "Confirmed implementation, integration, review and documentation for delivery. ".repeat(7))
      .slice(0, 480).trim() + ` END-${String(index + 1).padStart(3, "0")}`,
    amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001",
  }));
  invoice.amountDecimal = "100.0000000000000001";
  invoice.amountAtomic = "100000000000000000100";
  invoice.memo = "Memo first line.\n" + "Confirmed commercial work only, with no tax compliance claim. ".repeat(30).trim() + "\nMemo final line.";
  return document;
}

export function rawFixturePdf(content: string, options: { catalog?: string; stream?: string; page?: string } = {}): Uint8Array {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${options.catalog ?? ""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R ${options.page ?? ""} >>`,
    `<< /Length ${Buffer.byteLength(content)} ${options.stream ?? ""} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  return fixturePdfObjects(objects);
}

function fixturePdfObjects(objects: Array<string | Uint8Array>): Uint8Array {
  const parts = [Buffer.from("%PDF-1.7\n")];
  let length = parts[0].length;
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), typeof object === "string" ? Buffer.from(object) : object, Buffer.from("\nendobj\n")]);
    parts.push(part); length += part.length;
  }
  let pdf = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  parts.push(Buffer.from(pdf + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

export function resourceFixturePdf(options: { count?: number; decodedBytes?: number; images?: boolean; filter?: string;
  repeatedContents?: number; repeatedDrawing?: number } = {}): Uint8Array {
  const count = options.count ?? 1;
  const decoded = options.images ? Buffer.alloc(256 * 256 * 3) : Buffer.alloc(options.decodedBytes ?? 32, 32);
  const compressed = deflateSync(decoded);
  const references = Array.from({ length: count }, (_, index) => `${index + 6} 0 R`);
  const drawing = "BT /F1 10 Tf 42 780 Td (Safe fixture) Tj ET\n" + (options.images
    ? references.map((_, index) => `q 10 0 0 10 42 700 cm /I${index} Do Q\n`.repeat(options.repeatedDrawing ?? 1)).join("") : "");
  return fixturePdfObjects([
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << ${options.images
      ? references.map((ref, index) => `/I${index} ${ref}`).join(" ") : ""} >> >> /Contents [5 0 R ${options.images ? ""
        : options.repeatedContents ? Array(options.repeatedContents).fill(references[0]).join(" ") : references.join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}\nendstream`,
    ...references.map(() => Buffer.concat([Buffer.from(`<< /Length ${compressed.length} ${options.filter ?? "/Filter /FlateDecode"} ${options.images
      ? "/Type /XObject /Subtype /Image /Width 256 /Height 256 /BitsPerComponent 8 /ColorSpace /DeviceRGB" : ""} >>\nstream\n`), compressed, Buffer.from("\nendstream")])),
  ]);
}

export async function rasterizeTestPdf(bytes: Uint8Array) {
  // Independent test-only evidence reader; inputs are locally generated noncredential fixtures.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true,
    useWorkerFetch: false, useWasm: false, enableXfa: false,
    standardFontDataUrl: new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname });
  const pdf = await loading.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const text = await page.getTextContent();
      pages.push({ width: viewport.width, height: viewport.height, png: canvas.toBuffer("image/png"),
        text: text.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item) });
      page.cleanup();
    }
    return pages;
  } finally { await loading.destroy(); }
}

export async function writeInvoiceTestEvidence(directory: string) {
  const measurements = [];
  for (const [name, document] of [["normal", testInvoiceDocument()], ["long", longTestInvoiceDocument()]] as const) {
    const start = performance.now();
    const bytes = await renderInvoicePdf(buildPublishedInvoiceView(document, testInvoiceUrl)), rendered = performance.now();
    const inspection = await inspectInvoicePdf(bytes), inspected = performance.now();
    const pages = await rasterizeTestPdf(bytes);
    for (const number of new Set([1, Math.min(2, pages.length), pages.length])) {
      await writeFile(join(directory, `r06-invoice-${name}-${number}.png`), pages[number - 1].png);
    }
    measurements.push({ fixture: name, pages: inspection.pageCount, bytes: bytes.byteLength,
      renderMs: Math.round(rendered - start), rasterQrMs: Math.round(inspected - rendered), totalMs: Math.round(inspected - start) });
  }
  return measurements;
}

export async function probePackagedInvoicePdf(parent: string, fault?: "missing-jsqr" | "broken-worker" | "missing-font" | "missing-native"
  | "empty-qr-candidate" | "binary-qr-candidate" | "chunk-qr-candidate", inputBytes?: Uint8Array) {
  const root = process.cwd(), directory = await mkdtemp(join(parent, "r06-pdf-trace-"));
  try {
    const tracePath = join(root, ".next/server/app/api/jobs/publications/route.js.nft.json");
    const trace: { files: string[] } = JSON.parse(await readFile(tracePath, "utf8"));
    const chunks: string[] = [];
    for (const entry of trace.files) {
      const source = resolve(dirname(tracePath), entry), name = relative(root, source);
      if (name.startsWith("..") || name.split("/").some((part) => part.startsWith(".env"))) throw new Error("Unsafe trace entry");
      const target = join(directory, name), stat = await lstat(source);
      await mkdir(dirname(target), { recursive: true });
      if (stat.isSymbolicLink()) {
        const destination = relative(root, resolve(dirname(source), await readlink(source)));
        if (destination.startsWith("..")) throw new Error("Trace symlink escapes the package");
        await symlink(relative(dirname(target), join(directory, destination)), target);
      } else if (stat.isFile()) await copyFile(source, target);
      if (/^\.next\/server\/chunks\/[^/]+\.js$/.test(name) && !name.endsWith("[turbopack]_runtime.js")) chunks.push(name);
    }
    // Only traced files are copied. No root node_modules, TS loader, NODE_PATH,
    // source-module fallback, or application environment enters this process.
    const probe = String.raw`
      const fs = require("node:fs"), path = require("node:path");
      for (const name of process.argv[2] ? [] : ["pdfjs-dist/package.json", "pdfjs-dist/legacy/build/pdf.mjs", "pdfjs-dist/legacy/build/pdf.worker.mjs", "@napi-rs/canvas", "jsqr"]) {
        try {
          if (!require.resolve(name).startsWith(process.cwd() + path.sep)) throw new Error("Escaping dependency");
        } catch { process.stdout.write(JSON.stringify({ missingPackagedDependency: name })); process.exit(0); }
      }
      const runtime = require("./.next/server/chunks/[turbopack]_runtime.js")("pdf-package-probe");
      let id;
      for (const chunk of JSON.parse(process.argv[1])) {
        const factories = require(path.resolve(chunk));
        if (!Array.isArray(factories)) continue;
        runtime.c(chunk.slice(".next/".length));
        factories.forEach((factory, index) => {
          if (typeof factory === "function" && /\.s\(\["inspectInvoicePdf"/.test(factory.toString())) id = factories[index - 1];
        });
      }
      if (id === undefined) throw new Error("Compiled inspector was not traced");
      runtime.m(id).exports.inspectInvoicePdf(new Uint8Array(fs.readFileSync(0))).then(
        result => process.stdout.write(JSON.stringify(result)),
        error => process.stdout.write(JSON.stringify({ name: error.name, message: error.message })));
    `;
    if (fault === "missing-jsqr") await rm(join(directory, "node_modules/jsqr/dist/jsQR.js"));
    if (fault === "missing-font") await rm(join(directory, "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"));
    if (fault === "missing-native") for (const entry of trace.files.filter((entry) => entry.includes("canvas") && entry.endsWith(".node"))) {
      await rm(join(directory, relative(root, resolve(dirname(tracePath), entry))), { force: true });
    }
    if (fault === "broken-worker") await writeFile(join(directory, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
      'throw new Error("test-only bootstrap failure");');
    if (fault?.endsWith("-qr-candidate")) {
      const decoderPath = join(directory, "node_modules/jsqr/dist/jsQR.js");
      // Fault only the isolated external decoder. The first real pixel decode
      // becomes an empty candidate at the real QR's location, so erasing it or
      // filtering only the final destination array would lose the valid QR.
      const decoder = await readFile(decoderPath, "utf8");
      await writeFile(decoderPath, decoder + `\nconst originalDecoder = module.exports; let injected = false;
        module.exports = (...args) => {
          const code = originalDecoder(...args);
          if (!code || injected) return code;
          injected = true;
          return { ...code, data: "", binaryData: ${fault === "binary-qr-candidate" ? "[0]" : "[]"},
            chunks: ${fault === "chunk-qr-candidate" ? '[{ type: "eci", assignmentNumber: 26 }]' : "[]"} };
        };\n`);
    }
    const bytes = inputBytes ?? await fixturePdf({ destinations: [testInvoiceUrl] });
    const run = () => {
      const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", probe, JSON.stringify(chunks), fault ?? ""], {
        cwd: directory, env: { NODE_ENV: "production" }, input: bytes, encoding: "utf8", timeout: 60000, maxBuffer: 262144,
      });
      if (result.error || result.status !== 0) throw new Error("Isolated PDF package probe failed");
      return JSON.parse(result.stdout);
    };
    return run();
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function fixturePdf(options: {
  destinations?: string[]; placement?: "visible" | "offpage" | "covered" | "corrupt";
  pages?: number; size?: [number, number];
} = {}): Promise<Uint8Array> {
  const images = await Promise.all((options.destinations ?? []).map(async (url) => {
    const data = await QRCode.toDataURL(url, { width: 480, margin: 4, errorCorrectionLevel: "M" });
    if (options.placement !== "corrupt") return data;
    const canvas = createCanvas(480, 480), context = canvas.getContext("2d");
    context.drawImage(await loadImage(data), 0, 0);
    context.fillStyle = "white";
    context.fillRect(40, 40, 400, 400);
    return canvas.toDataURL("image/png");
  }));
  return new Uint8Array(await renderToBuffer(h(Document, { title: testInvoiceUrl,
    creationDate: new Date("2030-01-01T00:00:00.000Z"), modificationDate: new Date("2030-01-01T00:00:00.000Z") },
  ...Array.from({ length: options.pages ?? 1 }, (_, page) => h(Page, { key: page, size: options.size ?? "A4" },
    h(Text, { style: { margin: 32, fontFamily: "Helvetica", fontSize: 10 } }, `Fixture page ${page + 1}. ${testInvoiceUrl}`),
    ...(page === 0 ? images.map((src, index) => h(Image, { key: index, src, style: { position: "absolute",
      top: 120, left: options.placement === "offpage" ? 800 : 32 + index * 180, width: 144, height: 144 } })) : []),
    options.placement === "covered" ? h(View, { style: { position: "absolute", top: 100, left: 0,
      width: 595, height: 200, backgroundColor: "white" } }) : null,
  )))));
}

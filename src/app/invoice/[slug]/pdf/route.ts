import { isDeepStrictEqual } from "node:util";
import { keccak256 } from "viem";
import { createPrivateHeaders, privateDocumentError } from "../../../../lib/documents/private-response";
import { createDocumentRuntime } from "../../../../lib/documents/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  let headers = createPrivateHeaders();
  try {
    const runtime = createDocumentRuntime();
    headers = createPrivateHeaders(runtime.rpcOrigins);
    const { slug } = await params;
    const target = await runtime.access.resolve(slug);
    if (!target) return privateDocumentError(404, headers);
    const { invoiceId, invoiceVersion, invoiceNumber } = target;
    const attempt = structuredClone(target.attempt);
    const artifact = attempt.artifact;
    const stored = await runtime.storage.read(attempt.storageKey);
    if (!artifact || !stored || stored.contentType !== "application/pdf" || artifact.contentType !== "application/pdf"
      || stored.bytes.byteLength < 5 || stored.bytes.byteLength > 10 * 1024 * 1024
      || stored.bytes.byteLength !== stored.byteLength || stored.byteLength !== artifact.byteLength
      || artifact.pdfFilename.length > 200 || !/^[A-Za-z0-9_-]+\.pdf$/.test(artifact.pdfFilename)) {
      return privateDocumentError(503, headers);
    }
    // Own the verified buffer before awaiting authorization again. Storage and
    // repository objects must not be able to change the response across that wait.
    const bytes = new Uint8Array(stored.bytes);
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-" || keccak256(bytes) !== artifact.pdfContentHash) {
      return privateDocumentError(503, headers);
    }
    const current = await runtime.access.resolve(slug);
    if (!current) return privateDocumentError(404, headers);
    if (current.invoiceId !== invoiceId || current.invoiceVersion !== invoiceVersion || current.invoiceNumber !== invoiceNumber
      || !isDeepStrictEqual(current.attempt, attempt)) return privateDocumentError(503, headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Content-Disposition", `attachment; filename="${artifact.pdfFilename}"`);
    headers.set("X-Payr-Content-Hash", artifact.pdfContentHash);
    return new Response(bytes, { headers });
  } catch { return privateDocumentError(503, headers); }
}

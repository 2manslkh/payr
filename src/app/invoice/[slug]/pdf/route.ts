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
    const artifact = target.attempt.artifact;
    const stored = await runtime.storage.read(target.attempt.storageKey);
    if (!artifact || !stored || stored.contentType !== "application/pdf" || artifact.contentType !== "application/pdf"
      || stored.bytes.byteLength < 5 || stored.bytes.byteLength > 10 * 1024 * 1024
      || stored.bytes.byteLength !== stored.byteLength || stored.byteLength !== artifact.byteLength
      || new TextDecoder().decode(stored.bytes.subarray(0, 5)) !== "%PDF-"
      || keccak256(stored.bytes) !== artifact.pdfContentHash
      || artifact.pdfFilename.length > 200 || !/^[A-Za-z0-9_-]+\.pdf$/.test(artifact.pdfFilename)) {
      return privateDocumentError(503, headers);
    }
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(stored.bytes.byteLength));
    headers.set("Content-Disposition", `attachment; filename="${artifact.pdfFilename}"`);
    headers.set("X-Payr-Content-Hash", artifact.pdfContentHash);
    return new Response(new Uint8Array(stored.bytes), { headers });
  } catch { return privateDocumentError(503, headers); }
}

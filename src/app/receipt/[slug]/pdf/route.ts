import { isDeepStrictEqual } from "node:util";
import { createPrivateHeaders, privateDocumentError } from "../../../../lib/documents/private-response";
import { createReceiptRuntime } from "../../../../lib/receipts/runtime";
import { readReceiptBytes } from "../../../../lib/receipts/bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = createPrivateHeaders();
  try {
    const runtime = createReceiptRuntime();
    const { slug } = await params;
    const target = await runtime.access.resolve(slug);
    if (!target) return privateDocumentError(404, headers, "Receipt");
    const frozen = structuredClone(target);
    const bytes = await readReceiptBytes(frozen, runtime.storage);
    const current = await runtime.access.resolve(slug);
    if (!current) return privateDocumentError(404, headers, "Receipt");
    if (current.id !== frozen.id || !isDeepStrictEqual(current.artifact, frozen.artifact)) return privateDocumentError(503, headers, "Receipt");
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Content-Disposition", `attachment; filename="${frozen.artifact!.pdfFilename}"`);
    headers.set("X-Payr-Content-Hash", frozen.artifact!.pdfContentHash);
    return new Response(bytes, { headers });
  } catch { return privateDocumentError(503, headers, "Receipt"); }
}

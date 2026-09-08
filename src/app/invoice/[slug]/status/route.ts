import { createPrivateHeaders, privateDocumentError } from "../../../../lib/documents/private-response";
import { createDocumentRuntime } from "../../../../lib/documents/runtime";
import { publicPaymentStatus } from "../../../../lib/payments/public-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = createPrivateHeaders();
  try {
    const documents = createDocumentRuntime();
    const target = await documents.access.resolve((await params).slug);
    if (!target) return privateDocumentError(404, headers);
    return Response.json(publicPaymentStatus(target, documents.config), { headers });
  } catch { return privateDocumentError(503, headers); }
}

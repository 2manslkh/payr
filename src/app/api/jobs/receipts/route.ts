import { createReceiptRuntime } from "../../../../lib/receipts/runtime";
import { createReceiptWorker } from "../../../../lib/receipts/worker";
import { createReceiptDocumentPort } from "../../../../lib/documents/receipt-storage";
import { privateWorkerRequest } from "../../../../lib/workers/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export function GET(request: Request) {
  return privateWorkerRequest(request, async () => {
    const runtime = createReceiptRuntime();
    return createReceiptWorker(runtime.repository, createReceiptDocumentPort(runtime.storage), runtime.config).run();
  });
}

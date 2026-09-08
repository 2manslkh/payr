import { createOutboxRuntime } from "../../../../lib/email/runtime";
import { privateWorkerRequest } from "../../../../lib/workers/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export function GET(request: Request) {
  return privateWorkerRequest(request, async () => {
    const worker = createOutboxRuntime();
    return worker ? worker.run() : { outcome: "disabled" };
  });
}

import { createHash, timingSafeEqual } from "node:crypto";
import { createPrivateHeaders } from "../../../../lib/documents/private-response";
import { createReconciliationRuntime } from "../../../../lib/payments/reconciliation-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const headers = createPrivateHeaders();
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw new Error();
    if (!timingSafeEqual(createHash("sha256").update(`Bearer ${secret}`).digest(),
      createHash("sha256").update(request.headers.get("authorization") ?? "").digest())) {
      return Response.json({ code: "UNAUTHORIZED" }, { status: 401, headers });
    }
    return Response.json(await createReconciliationRuntime().backfill(50), { headers });
  } catch { return Response.json({ code: "RECONCILIATION_UNAVAILABLE" }, { status: 503, headers }); }
}

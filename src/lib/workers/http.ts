import { createHash, timingSafeEqual } from "node:crypto";
import { createPrivateHeaders } from "../documents/private-response";

export async function privateWorkerRequest(request: Request, run: () => Promise<unknown>, secret = process.env.CRON_SECRET) {
  const headers = createPrivateHeaders();
  try {
    if (!secret || secret.length < 32) throw new Error();
    if (!timingSafeEqual(createHash("sha256").update(`Bearer ${secret}`).digest(),
      createHash("sha256").update(request.headers.get("authorization") ?? "").digest())) {
      return Response.json({ code: "UNAUTHORIZED" }, { status: 401, headers });
    }
    return Response.json(await run(), { headers });
  } catch { return Response.json({ code: "WORKER_UNAVAILABLE" }, { status: 503, headers }); }
}

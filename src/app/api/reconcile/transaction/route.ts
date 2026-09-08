import { createHmac } from "node:crypto";
import { z } from "zod";
import { createDocumentAccessEnv } from "../../../../config/env";
import { readAuthJson } from "../../../../lib/auth/http";
import { IdentityError } from "../../../../lib/identity/contracts";
import { createSupabaseAdminClient } from "../../../../lib/db/admin";
import { createDocumentRepository } from "../../../../lib/db/documents";
import { normalizeDocumentIp } from "../../../../lib/documents/access";
import { createPrivateHeaders } from "../../../../lib/documents/private-response";
import { createReconciliationRuntime } from "../../../../lib/payments/reconciliation-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const deadline = Date.now() + 240_000;
  const headers = createPrivateHeaders();
  try {
    const config = createDocumentAccessEnv();
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "local" : "local";
    const hash = createHmac("sha256", config.pepper).update(`payr:reconcile:ip:${normalizeDocumentIp(ip)}`).digest("hex");
    const database = createSupabaseAdminClient();
    const admission = createDocumentRepository({ rpc: (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(10_000)) });
    if (!(await admission.admit("ip", hash)).allowed) {
      return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers });
    }
    const parsed = z.object({ transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict().safeParse(await readAuthJson(request));
    if (!parsed.success) return Response.json({ code: "INVALID_INPUT" }, { status: 400, headers });
    const result = await createReconciliationRuntime().transaction(parsed.data.transactionHash as `0x${string}`, undefined, deadline);
    return Response.json(result, { status: result.outcome === "pending" ? 202 : 200, headers });
  } catch (error) {
    if (error instanceof IdentityError && [400, 413, 415].includes(error.status)) return Response.json({ code: "INVALID_INPUT" }, { status: error.status, headers });
    return Response.json({ code: "RECONCILIATION_UNAVAILABLE" }, { status: 503, headers });
  }
}

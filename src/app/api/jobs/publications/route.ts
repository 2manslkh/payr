import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readAuthJson } from "../../../../lib/auth/http";
import { privateJson } from "../../../../lib/auth/runtime";
import { PublicationError, type PublicationWorkerResult } from "../../../../lib/invoices/publication-contracts";
import { publicationErrorResponse } from "../../../../lib/invoices/publication-http";
import { getPublicationDocumentPort, getPublicationLinkConfig, getPublicationRepository } from "../../../../lib/invoices/publication-runtime";
import { createPublicationWorker } from "../../../../lib/invoices/publication-worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw new PublicationError("CONFIGURATION_ERROR", 503);
    // Fixed-size digests keep comparison timing independent of the supplied bearer length.
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    const supplied = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
    if (!timingSafeEqual(expected, supplied)) throw new PublicationError("CRON_UNAUTHORIZED", 401);
    const { limit } = z.object({ limit: z.number().int().min(1).max(10) }).strict().parse(await readAuthJson(request));
    const documents = getPublicationDocumentPort();
    const config = getPublicationLinkConfig();
    const repository = getPublicationRepository();
    const worker = createPublicationWorker(repository, config, documents);
    const { expired } = await repository.expire(limit);
    const results: PublicationWorkerResult[] = [];
    for (let index = 0; index < limit; index++) {
      const result = await worker.run();
      results.push(result);
      if (result.outcome === "idle") break;
    }
    return privateJson({ results, expired });
  } catch (error) { return publicationErrorResponse(error); }
}

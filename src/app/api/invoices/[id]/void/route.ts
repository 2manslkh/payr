import { z, ZodError } from "zod";
import { privateJson, requireRequestSession } from "../../../../../lib/auth/runtime";
import { IdentityError } from "../../../../../lib/identity/contracts";
import { createInvoiceLifecycleService } from "../../../../../lib/invoices/lifecycle";
import { invoiceId, ownerActor } from "../../../../../lib/invoices/projections";
import { PublicationError } from "../../../../../lib/invoices/publication-contracts";
import { publicationErrorResponse } from "../../../../../lib/invoices/publication-http";
import { getPublicationLinkConfig, getPublicationRepository } from "../../../../../lib/invoices/publication-runtime";

const voidBody = z.object({
  expectedVersion: z.number().int().positive(), approval: z.literal(true), idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

async function readVoidBody(request: Request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
    || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) {
    throw new IdentityError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const limit = 16 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > limit)) throw new PublicationError("PAYLOAD_TOO_LARGE", 413);
  if (!request.body) throw new PublicationError("INVALID_INPUT", 400);
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new PublicationError("PAYLOAD_TOO_LARGE", 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = voidBody.parse(JSON.parse(text));
    // The schema is flat; scan validated JSON tokens so duplicate version/approval/key fields cannot be overwritten.
    const keys = new Set<string>();
    let lastString = "";
    for (const [token] of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|:/g)) {
      if (token === ":") {
        const key: string = JSON.parse(lastString);
        if (keys.has(key)) throw new PublicationError("INVALID_INPUT", 400);
        keys.add(key);
      } else lastString = token;
    }
    return input;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof PublicationError || error instanceof ZodError) throw error;
    throw new PublicationError("INVALID_INPUT", 400);
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRequestSession(request, true);
    if (new URL(request.url).search) throw new PublicationError("INVALID_INPUT", 400);
    const id = invoiceId((await params).id);
    const input = await readVoidBody(request);
    const service = createInvoiceLifecycleService(getPublicationRepository(), getPublicationLinkConfig());
    return privateJson(await service.void(ownerActor(session), { ...input, invoiceId: id }));
  } catch (error) {
    return publicationErrorResponse(error);
  }
}

import { z, ZodError } from "zod";
import { IdentityError } from "../identity/contracts";
import { PublicationError } from "./publication-contracts";

const schema = z.object({
  expectedVersion: z.number().int().positive(), approval: z.literal(true), idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

export async function readPublicationApproval(request: Request) {
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
    const input = schema.parse(JSON.parse(text));
    // This body is flat. Decode property names so escaped duplicates cannot alter approval or version.
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

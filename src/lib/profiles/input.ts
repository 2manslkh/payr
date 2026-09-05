import type { z } from "zod";
import { IdentityError } from "../identity/contracts";

export async function parseIdentityInput<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const limit = 16 * 1024;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new IdentityError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > limit) {
    throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new IdentityError("INVALID_INPUT");

  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    const result = schema.safeParse(json);
    if (!result.success) throw new IdentityError("INVALID_INPUT");
    return result.data;
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}

import { IdentityError, SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from "../identity/contracts";

export async function readAuthJson(request: Request, allowEmpty = false): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if ((contentType === null && !(allowEmpty && request.body === null))
    || (contentType !== null && !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType))
    || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) {
    throw new IdentityError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  const limit = 16 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > limit)) throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
  if (!request.body) {
    if (allowEmpty) return {};
    throw new IdentityError("INVALID_INPUT");
  }
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new IdentityError("PAYLOAD_TOO_LARGE", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return allowEmpty && size === 0 ? {} : JSON.parse(text);
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}

export function setSessionCookie(response: Response, token: string | null): void {
  response.headers.set("Set-Cookie", `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${token === null ? 0 : SESSION_LIFETIME_SECONDS}${token === null ? "; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : ""}`);
}

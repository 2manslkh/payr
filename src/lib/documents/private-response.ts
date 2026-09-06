import { randomBytes } from "node:crypto";
import { DocumentUnavailableError } from "./contracts";

export function createPrivateHeaders(rpcOrigins: readonly string[] = []): Headers {
  const nonce = randomBytes(24).toString("base64");
  for (const origin of rpcOrigins) {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error();
    } catch { throw new DocumentUnavailableError(); }
  }
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", "img-src 'self' data:",
      `connect-src 'self'${rpcOrigins.length ? ` ${[...new Set(rpcOrigins)].join(" ")}` : ""}`,
      `script-src 'self' 'nonce-${nonce}'`, `style-src 'self' 'nonce-${nonce}'`,
    ].join("; "),
  });
}

export function privateDocumentError(status: 404 | 503, headers = createPrivateHeaders()): Response {
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(status === 404 ? "Invoice not found.\n" : "Invoice temporarily unavailable. Try again later.\n", { status, headers });
}

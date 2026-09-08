import { NextRequest, NextResponse } from "next/server";
import { createPrivateHeaders, privateDocumentError } from "./lib/documents/private-response";
import { createDocumentRuntime } from "./lib/documents/runtime";
import { createReceiptRuntime } from "./lib/receipts/runtime";

export async function proxy(request: NextRequest) {
  let headers = createPrivateHeaders();
  const kind = request.nextUrl.pathname.startsWith("/receipt/") ? "Receipt" : "Invoice";
  try {
    const runtime = kind === "Receipt" ? createReceiptRuntime() : createDocumentRuntime();
    const rpcOrigins = "rpcOrigins" in runtime ? runtime.rpcOrigins : [];
    headers = createPrivateHeaders(rpcOrigins);
    const match = /^\/(invoice|receipt)\/([^/]+)(?:\/(pdf|status))?\/?$/.exec(request.nextUrl.pathname);
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "local" : "local";
    const target = await runtime.access.resolve(match?.[2] ?? "", ip);
    if (request.nextUrl.pathname === `/${kind.toLowerCase()}/system/unavailable`) return privateDocumentError(503, headers, kind);
    if (!target || !match || (kind === "Receipt" && match[3] === "status") || !["GET", "HEAD"].includes(request.method)) return privateDocumentError(404, headers, kind);

    if (kind === "Invoice" && !match[3] && "commercialState" in target && target.commercialState === "published"
      && target.settlement === null && target.payableUntil !== null && Date.parse(target.payableUntil) > Date.now()
      && /^[0-9a-f]{32}$/.test(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "")) {
      headers = createPrivateHeaders(rpcOrigins, true);
    }

    const requestHeaders = new Headers(request.headers);
    for (const name of [...requestHeaders.keys()]) {
      if (name.startsWith("x-payr-") || name === "content-security-policy-report-only") requestHeaders.delete(name);
    }
    const csp = headers.get("Content-Security-Policy")!;
    requestHeaders.set("Content-Security-Policy", csp);
    requestHeaders.set("x-nonce", /'nonce-([^']+)'/.exec(csp)![1]);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    headers.forEach((value, name) => response.headers.set(name, value));
    return response;
  } catch { return privateDocumentError(503, headers, kind); }
}

// No prefetch/RSC exclusions: every protected representation crosses admission.
export const config = { matcher: ["/invoice/:path*", "/receipt/:path*"] };

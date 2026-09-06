import { NextRequest, NextResponse } from "next/server";
import { createPrivateHeaders, privateDocumentError } from "./lib/documents/private-response";
import { createDocumentRuntime } from "./lib/documents/runtime";

export async function proxy(request: NextRequest) {
  let headers = createPrivateHeaders();
  try {
    const runtime = createDocumentRuntime();
    headers = createPrivateHeaders(runtime.rpcOrigins);
    const match = /^\/invoice\/([^/]+)(?:\/pdf)?\/?$/.exec(request.nextUrl.pathname);
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "local" : "local";
    const target = await runtime.access.resolve(match?.[1] ?? "", ip);
    if (request.nextUrl.pathname === "/invoice/system/unavailable") return privateDocumentError(503, headers);
    if (!target || !match || !["GET", "HEAD"].includes(request.method)) return privateDocumentError(404, headers);

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
  } catch { return privateDocumentError(503, headers); }
}

// No prefetch/RSC exclusions: every protected representation crosses admission.
export const config = { matcher: "/invoice/:path*" };

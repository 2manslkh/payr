import { NextRequest, NextResponse } from "next/server";
import { createPrivateHeaders, privateDocumentError } from "./lib/documents/private-response";
import { createDocumentRuntime } from "./lib/documents/runtime";
import { createReceiptRuntime } from "./lib/receipts/runtime";
import { discoveryLinks, homepageMarkdown } from "./lib/discovery";
import { prefersMarkdown } from "./lib/markdown-negotiation";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const headers = { Link: discoveryLinks, "Content-Signal": "search=yes, ai-train=no, ai-input=no" };
    // Vercel's response transform preserves Accept after Next overwrites Vary.
    // Elsewhere keep the explicit /index.md alternate until an equivalent layer exists.
    if (process.env.VERCEL === "1" && ["GET", "HEAD"].includes(request.method)
      && !request.headers.has("rsc") && !request.headers.has("next-router-prefetch")
      && request.headers.get("purpose") !== "prefetch" && prefersMarkdown(request.headers.get("accept"))) {
      return new NextResponse(request.method === "HEAD" ? null : homepageMarkdown, { headers: {
        ...headers, "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept",
        "Cache-Control": "no-store",
      } });
    }
    return NextResponse.next({ headers });
  }
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

export const config = { matcher: [
  // Match before Next strips Flight headers from the handler's NextRequest.
  { source: "/", missing: [
    { type: "header", key: "rsc" },
    { type: "header", key: "next-router-prefetch" },
    { type: "header", key: "next-router-segment-prefetch" },
    { type: "header", key: "purpose", value: "prefetch" },
  ] },
  // Every protected representation, including RSC/prefetch, crosses admission.
  "/invoice/:path*", "/receipt/:path*",
] };

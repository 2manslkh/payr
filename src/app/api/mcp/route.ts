import { serveMcpRequest } from "../../../lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  // Never fall back to cookies, query strings, or a second credential source.
  const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const response = token ? await serveMcpRequest(request, token) : Response.json({
    jsonrpc: "2.0", id: null, error: { code: -32000, message: "Connector unavailable" },
  }, { status: 401, headers: {
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive",
  } });
  if (response.status === 401) response.headers.set("WWW-Authenticate", 'Bearer realm="Payr"');
  return response;
}

export { handle as POST, handle as GET, handle as DELETE, handle as HEAD, handle as OPTIONS, handle as PUT, handle as PATCH };

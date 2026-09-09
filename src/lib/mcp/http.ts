import { createMcpRuntime } from "./runtime";
import { handleMcpRequest } from "./transport";

export async function serveMcpRequest(request: Request, token: string) {
  try {
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "" : "127.0.0.1";
    return await handleMcpRequest(request, token, ip, createMcpRuntime());
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Service unavailable" } }, {
      status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  }
}

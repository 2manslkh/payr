import { createMcpRuntime } from "../../../../lib/mcp/runtime";
import { handleMcpRequest } from "../../../../lib/mcp/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "" : "127.0.0.1";
    return await handleMcpRequest(request, (await params).token, ip, createMcpRuntime());
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Service unavailable" } }, {
      status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  }
}
export { handle as POST, handle as GET, handle as DELETE, handle as HEAD, handle as OPTIONS, handle as PUT, handle as PATCH };

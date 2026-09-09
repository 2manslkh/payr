import { serveMcpRequest } from "../../../../lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return serveMcpRequest(request, (await params).token);
}
export { handle as POST, handle as GET, handle as DELETE, handle as HEAD, handle as OPTIONS, handle as PUT, handle as PATCH };

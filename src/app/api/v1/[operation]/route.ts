import { operationNames, type AgentOperation } from "../../../../lib/agent-api/contracts";
import { agentErrorResponse, handleAgentRequest } from "../../../../lib/agent-api/http";
import { createAgentRuntime } from "../../../../lib/agent-api/runtime";
import { IdentityError } from "../../../../lib/identity/contracts";

export const runtime = "nodejs";

async function handle(request: Request, { params }: { params: Promise<{ operation: string }> }): Promise<Response> {
  try {
    const { operation } = await params;
    if (!operationNames.includes(operation as AgentOperation)) return agentErrorResponse(new IdentityError("NOT_FOUND", 404));
    if (request.method !== "POST") return agentErrorResponse(new IdentityError("METHOD_NOT_ALLOWED", 405));
    const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? "" : "127.0.0.1";
    return await handleAgentRequest(request, operation, ip, createAgentRuntime());
  } catch {
    return agentErrorResponse(new IdentityError("CONFIGURATION_ERROR", 503));
  }
}

export { handle as POST, handle as GET, handle as HEAD, handle as OPTIONS, handle as PUT, handle as PATCH, handle as DELETE };

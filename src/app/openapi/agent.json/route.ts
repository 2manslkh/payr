import { buildAgentOpenApi } from "../../../lib/agent-api/openapi";
import { discoveryOrigin } from "../../../lib/discovery";

export function GET() {
  return Response.json(buildAgentOpenApi(discoveryOrigin()), {
    headers: { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
  });
}

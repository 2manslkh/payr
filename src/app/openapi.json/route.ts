import { discoveryOrigin } from "../../lib/discovery";

export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: { title: "Payr Public Liveness API", version: "1.0.0", description: "Application liveness only. Does not describe private workspace APIs or dependency readiness." },
    servers: [{ url: discoveryOrigin() }],
    paths: { "/api/health": { get: {
      operationId: "getHealth", security: [],
      responses: { "200": { description: "Application is responding", content: { "application/json": { schema: {
        type: "object", required: ["status", "commit"], properties: {
          status: { type: "string", const: "ok" }, commit: { type: ["string", "null"] },
        },
      } } } } },
    } } },
  });
}

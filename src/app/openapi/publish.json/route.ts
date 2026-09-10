import { discoveryOrigin } from "../../../lib/discovery";

export function GET() {
  const errorSchema = { oneOf: [
    { type: "object", required: ["code"], properties: {
      code: { type: "string" }, failureCode: { type: "string" }, draftId: { type: "string", format: "uuid" }, currentVersion: { type: "integer" },
    } },
    { type: "object", required: ["error"], properties: {
      error: { type: "object", required: ["code"], properties: { code: { type: "string" } } },
    } },
  ] };
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Payr Invoice Publication API", version: "1.0.0",
      description: "Publish & Send an explicitly reviewed Payr invoice draft. Supply its ID and exact version, approval:true and deliveryApproval:true. Queues invoice email through Resend to the frozen client and sender, with PDF attached and private links. Does not authorize wallet spending or settle invoices. Refresh/reimport older clients before activation.",
    },
    servers: [{ url: discoveryOrigin() }],
    security: [{ connectorBearer: [] }],
    components: { securitySchemes: { connectorBearer: {
      type: "http", scheme: "bearer",
      description: "A live Payr connector credential with invoice:publish and invoice:status scopes. Workspace identity comes from the credential, never from request input. Keep credentials out of shared recipes and URLs. Gateway payment does not grant workspace authority.",
    } } },
    paths: { "/api/invoices/{id}/publish": { post: {
      operationId: "publish_invoice", summary: "Publish an approved invoice draft",
      description: "Approve this exact draft version, defaults, client-profile diff, and email to snapshot client.contactEmail and sender.contactEmail. One message per distinct address, equal addresses combine roles. Do not send a duplicate via Gmail. Use the same idempotencyKey and unchanged input on retry. Version/profile conflicts need fresh review. Email disabled rejects fresh publication before writing. Historical requests never enqueue email. Provider failure never undoes publication; sent means provider acceptance, not inbox delivery. Server-to-server callers should omit Origin; if supplied it must match the Payr API origin.",
      parameters: [{ name: "id", in: "path", required: true, description: "Existing draft ID in the credential's workspace", schema: { type: "string", format: "uuid" } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", additionalProperties: false, required: ["expectedVersion", "approval", "deliveryApproval", "idempotencyKey"],
        properties: {
          expectedVersion: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "Exact version the user reviewed and approved" },
          approval: { type: "boolean", const: true, description: "Explicit user approval of this invoice version; never infer approval" },
          deliveryApproval: { type: "boolean", const: true, description: "Explicit approval to email both frozen snapshot recipients through Payr" },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Nonblank key, trimmed before use. Preserve it and the request input for retries." },
        },
      }, example: { expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: "publish-approved-draft-1" } } } },
      responses: {
        "200": { description: "Finalized publication with durable invoiceEmail states, or authorized replay. No funds moved. Provider acceptance is not inbox delivery.", content: { "application/json": { schema: {
          type: "object", required: ["invoiceId", "invoiceVersion", "invoiceNumber", "commercialState", "invoiceUrl", "invoicePdfUrl", "pdfFilename", "pdfContentHash", "documentCommitment", "gmailLinkPackage", "sendApprovalRequired", "invoiceEmail"],
          properties: {
            invoiceId: { type: "string", format: "uuid" }, invoiceVersion: { type: "integer", minimum: 1 }, invoiceNumber: { type: "string" },
            commercialState: { type: "string", enum: ["draft", "published", "voided", "expired"] },
            invoiceUrl: { type: "string", format: "uri" }, invoicePdfUrl: { type: "string", format: "uri" }, pdfFilename: { type: "string" },
            pdfContentHash: { type: "string", pattern: "^0x[0-9a-f]{64}$" }, documentCommitment: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
            gmailLinkPackage: { type: "object", required: ["to", "subject", "textBody", "htmlBody", "paymentUrl", "invoicePdfUrl"], properties: {
              to: { type: "array", items: { type: "string" } }, subject: { type: "string" }, textBody: { type: "string" }, htmlBody: { type: "string" },
              paymentUrl: { type: "string", format: "uri" }, invoicePdfUrl: { type: "string", format: "uri" },
            } },
            sendApprovalRequired: { type: "boolean", const: false, description: "Legacy field. Publish & Send already includes email approval; never request a separate Gmail send." },
            invoiceEmail: { type: "object", required: ["state", "deliveries"], properties: {
              state: { type: "string", enum: ["not_applicable", "queued", "sending", "sent", "failed", "manual_review"] },
              deliveries: { type: "array", maxItems: 2, items: { type: "object", required: ["roles", "state", "attemptCount", "nextAttemptAt"], properties: {
                roles: { type: "array", items: { type: "string", enum: ["issuer", "client"] } }, state: { type: "string", enum: ["pending", "sending", "retry_wait", "sent", "failed", "manual_review"] },
                attemptCount: { type: "integer", minimum: 0 }, nextAttemptAt: { type: ["string", "null"] },
              } } },
            } },
          },
        } } } },
        ...Object.fromEntries(Object.entries({
          "400": "Invalid ID or approval body; duplicate/unknown fields are rejected",
          "401": "Missing, malformed, expired, revoked, or insufficiently scoped credential",
          "403": "Origin rejected or workspace/operation authority denied",
          "404": "Invoice not found in the authorized workspace",
          "409": "Version/idempotency conflict, non-editable draft, or publication in progress/failed; inspect code",
          "413": "Approval body exceeds 16 KiB",
          "415": "Uncompressed application/json (optionally charset=utf-8) required",
          "429": "Rate limited; honor Retry-After before retrying unchanged input",
          "500": "Sanitized internal failure",
          "503": "Publication temporarily unavailable; inspect code and retry unchanged input when appropriate",
        }).map(([status, description]) => [status, {
          description, content: { "application/json": { schema: errorSchema } },
          ...(status === "429" ? { headers: { "Retry-After": { description: "Delay in seconds", schema: { type: "integer", minimum: 1 } } } } : {}),
        }])),
      },
    } } },
  }, { headers: { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
}

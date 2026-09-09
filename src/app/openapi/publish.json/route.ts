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
      description: "Publish an existing, explicitly approved Payr invoice draft. Create and review the draft in Payr or its existing MCP first; supply its ID and exact version. This API does not create drafts, send email, authorize wallet spending, or settle invoices. Returned document links are private bearer capabilities.",
    },
    servers: [{ url: discoveryOrigin() }],
    security: [{ connectorBearer: [] }],
    components: { securitySchemes: { connectorBearer: {
      type: "http", scheme: "bearer",
      description: "A live Payr connector credential with invoice:publish and invoice:status scopes. Workspace identity comes from the credential, never from request input. Keep credentials out of shared recipes and URLs. Gateway payment does not grant workspace authority.",
    } } },
    paths: { "/api/invoices/{id}/publish": { post: {
      operationId: "publish_invoice", summary: "Publish an approved invoice draft",
      description: "Obtain explicit user approval of this exact draft version before calling. Publishes the frozen invoice and returns its payment link, verified PDF link, and a Gmail-ready package (not a sent email). Use the same idempotencyKey and unchanged input when retrying a timeout, PUBLICATION_IN_PROGRESS, or PUBLICATION_RETRYABLE. Do not silently adopt a newer version after VERSION_CONFLICT; review and obtain approval again. Replaying a completed request returns the invoice's current commercial state, which may no longer be payable. Server-to-server callers should omit Origin; if supplied it must match the Payr API origin.",
      parameters: [{ name: "id", in: "path", required: true, description: "Existing draft ID in the credential's workspace", schema: { type: "string", format: "uuid" } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", additionalProperties: false, required: ["expectedVersion", "approval", "idempotencyKey"],
        properties: {
          expectedVersion: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "Exact version the user reviewed and approved" },
          approval: { type: "boolean", const: true, description: "Explicit user approval of this invoice version; never infer approval" },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Nonblank key, trimmed before use. Preserve it and the request input for retries." },
        },
      }, example: { expectedVersion: 1, approval: true, idempotencyKey: "publish-approved-draft-1" } } } },
      responses: {
        "200": { description: "Finalized publication or authorized replay. No email was sent and no funds were moved.", content: { "application/json": { schema: {
          type: "object", required: ["invoiceId", "invoiceVersion", "invoiceNumber", "commercialState", "invoiceUrl", "invoicePdfUrl", "pdfFilename", "pdfContentHash", "documentCommitment", "gmailLinkPackage", "sendApprovalRequired"],
          properties: {
            invoiceId: { type: "string", format: "uuid" }, invoiceVersion: { type: "integer", minimum: 1 }, invoiceNumber: { type: "string" },
            commercialState: { type: "string", enum: ["draft", "published", "voided", "expired"] },
            invoiceUrl: { type: "string", format: "uri" }, invoicePdfUrl: { type: "string", format: "uri" }, pdfFilename: { type: "string" },
            pdfContentHash: { type: "string", pattern: "^0x[0-9a-f]{64}$" }, documentCommitment: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
            gmailLinkPackage: { type: "object", required: ["to", "subject", "textBody", "htmlBody", "paymentUrl", "invoicePdfUrl"], properties: {
              to: { type: "array", items: { type: "string" } }, subject: { type: "string" }, textBody: { type: "string" }, htmlBody: { type: "string" },
              paymentUrl: { type: "string", format: "uri" }, invoicePdfUrl: { type: "string", format: "uri" },
            } },
            sendApprovalRequired: { type: "boolean", const: true },
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

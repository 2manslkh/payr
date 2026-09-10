import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { mcpServerInfo } from "./info";
import type { InvoiceActor } from "../invoices/contracts";
import { DraftError } from "../invoices/errors";
import { PublicationError } from "../invoices/publication-contracts";
import { IdentityError, saveConnectorSenderSchema } from "../identity/contracts";
import type { createConnectorSenderService } from "../profiles/connector";
import type { createInvoiceDraftService } from "../invoices/service";
import type { createPublicationService } from "../invoices/publication";
import type { createInvoiceLifecycleService } from "../invoices/lifecycle";

export type McpServices = Pick<ReturnType<typeof createInvoiceDraftService>, "createDraft">
  & Pick<ReturnType<typeof createPublicationService>, "publish">
  & Pick<ReturnType<typeof createInvoiceLifecycleService>, "status" | "void">
  & ReturnType<typeof createConnectorSenderService>
  & { getAccountContext?: (actor: InvoiceActor, input: unknown) => Promise<Record<string, unknown>> };
export const toolActions = {
  create_invoice_draft: "invoice:draft", publish_invoice: "invoice:publish",
  get_invoice_status: "invoice:status", void_invoice: "invoice:void",
  get_sender_profile: "sender:read", save_sender_profile: "sender:write",
  get_account_context: "wallet:read",
} as const;

// Discovery documentation only. Canonical services own all validation and mutations.
const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const uuid = { type: "string", format: "uuid" };
const version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, object>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const confirmed = (value: object) => object({ value, confirmed: { const: true }, provenance: { oneOf: [
  object({ kind: { const: "user_provided" } }, ["kind"]),
  object({ kind: { const: "web_source" }, url: { type: "string", format: "uri", pattern: "^https?://" } }, ["kind", "url"]),
] } }, ["value", "confirmed", "provenance"]);
const common = " Payr does not search. Only confirmed user_provided or URL-bearing web_source proposals are accepted; saved_profile is server-owned. Publish & Send queues invoice email through Payr; do not send a duplicate through Gmail. Paid requires reconciliation-derived persisted settlement, never a wallet callback.";
const tools: Tool[] = [
  { name: "get_account_context", description: "After connecting, discover the business receiving wallet and current invoice payout address. Requires explicit wallet:read permission. These addresses may differ. A null businessWallet means Privy onboarding is not linked yet. Read-only: no signing, spending, wallet creation, or payout authority. Never ask for a private key or Privy token.",
    inputSchema: object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "get_sender_profile", description: "Direct Chat Setup: requires opt-in sender:read. Read sender fields, missing fields, profile id and revision before setup or updates. No payout authority. If unavailable, enable Direct Chat Setup on a new dashboard connection or complete the sender in the dashboard.",
    inputSchema: object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "save_sender_profile", description: "Direct Chat Setup: requires opt-in sender:write. Setup or update only after the user explicitly approves all business/contact/address fields, invoice prefix and default terms. Supply expectedProfileId and expectedRevision from get_sender_profile and approval:true. Repeated or stale saves conflict: read again and obtain fresh approval, never retry blindly. Payout is ALWAYS owner-signed dashboard only. Never include wallet, actor or workspace fields.",
    inputSchema: z.toJSONSchema(saveConnectorSenderSchema, { io: "input" }) as Tool["inputSchema"],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
  { name: "create_invoice_draft", description: "Gather or revise a USDC invoice. Missing fields return MISSING_FIELDS with draftCreated:false and cause no mutation. Revision uses draftId plus expectedVersion on this same tool. Review the complete preview, applied defaults, and client-profile diff before explicit publication approval. No sender or payout authority." + common,
    inputSchema: object({ draftId: uuid, expectedVersion: version, idempotencyKey: text(128),
      client: object({ id: uuid, alias: text(100), proposed: object({ businessName: confirmed(text(200)), contactName: confirmed(text(200)),
        contactEmail: confirmed({ ...text(254), format: "email" }), billingAddress: confirmed(object({
          line1: text(200), line2: { type: "string", maxLength: 200 }, city: text(100), region: { type: "string", maxLength: 100 },
          postalCode: text(32), countryCode: { type: "string", pattern: "^[A-Z]{2}$" },
        }, ["line1", "city", "postalCode", "countryCode"])) }) }),
      items: { type: "array", maxItems: 100, items: object({ description: text(500), amount: { ...text(79), description: "Exact non-exponent decimal USDC string, never a floating-point number." } }) },
      issueDate: { type: "string", format: "date" }, dueDate: { type: "string", format: "date" }, useDefaultTerms: { type: "boolean" },
      memo: { type: "string", maxLength: 2000 },
    }, ["idempotencyKey"]), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "publish_invoice", description: "Publish & Send only after explicit approval:true and deliveryApproval:true of this exact draft version, all defaults, client-profile diff, and email to the snapshot client.contactEmail and sender.contactEmail. One separate message per distinct address includes the frozen PDF and private invoice/PDF links. Retry unchanged input and the same idempotency key. invoiceEmail reports per-recipient states; sent means provider acceptance, not inbox delivery. Disabled email fails before a new publication write. Refresh/reimport older tool schemas before activation. This does not authorize payment." + common,
    inputSchema: object({ draftId: uuid, expectedVersion: version, approval: { const: true }, deliveryApproval: { const: true }, idempotencyKey: text(128) }, ["draftId", "expectedVersion", "approval", "deliveryApproval", "idempotencyKey"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "get_invoice_status", description: "Read the complete canonical status for an invoice in this workspace. Keep commercial state, persisted settlement, receipt readiness, and email provider acceptance separate. Recipient delivery details are private to this authenticated workspace." + common,
    inputSchema: object({ invoiceId: uuid }, ["invoiceId"]), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "void_invoice", description: "Void an unpaid published invoice only after separate explicit approval:true of the exact invoice/version. Existing short-lived payment authorizations are not revoked onchain. A valid later settlement is still recorded and receipted; void is not a refund." + common,
    inputSchema: object({ invoiceId: uuid, expectedVersion: version, approval: { const: true }, idempotencyKey: text(128) }, ["invoiceId", "expectedVersion", "approval", "idempotencyKey"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
];
const statusInput = z.object({ invoiceId: z.string().uuid() }).strict();
const safeCodes = new Set(["INVALID_INPUT", "PROHIBITED_FIELD", "PAYLOAD_TOO_LARGE", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "PROFILE_CONFLICT", "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT", "DRAFT_NOT_EDITABLE", "PUBLICATION_IN_PROGRESS", "PUBLICATION_FAILED", "PUBLICATION_RETRYABLE", "LEASE_LOST",
  "INVOICE_NOT_VOIDABLE", "LINK_UNAVAILABLE", "CONFIGURATION_ERROR", "DOCUMENTS_NOT_CONFIGURED", "DELIVERY_APPROVAL_REQUIRED", "INVOICE_EMAIL_DISABLED"]);

export function createMcpServer(actor: InvoiceActor, services: McpServices) {
  const server = new Server(mcpServerInfo, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      let result;
      switch (params.name) {
        case "get_account_context":
          if (!services.getAccountContext) throw new IdentityError("CONFIGURATION_ERROR", 503);
          result = await services.getAccountContext(actor, params.arguments ?? {}); break;
        case "get_sender_profile": result = await services.getSenderProfile(actor, params.arguments ?? {}); break;
        case "save_sender_profile": result = await services.saveSenderProfile(actor, params.arguments); break;
        case "create_invoice_draft": result = await services.createDraft(actor, params.arguments); break;
        case "publish_invoice": result = await services.publish(actor, params.arguments); break;
        case "get_invoice_status": result = await services.status(actor, statusInput.parse(params.arguments).invoiceId); break;
        case "void_invoice": result = await services.void(actor, params.arguments); break;
        default: throw new IdentityError("INVALID_INPUT");
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      let result: Record<string, unknown>;
      if (error instanceof DraftError && error.code === "MISSING_FIELDS") {
        result = { code: "MISSING_FIELDS", draftCreated: false, missingFields: error.details.missingFields };
        result.guidance = "For missing sender fields, use get_sender_profile, review the full proposed sender with the user, then save_sender_profile with explicit approval. These require opt-in sender:read/sender:write on a new dashboard connection; otherwise complete the sender in the dashboard. Payout changes are owner-signed dashboard only. Never add sender or payout fields to create_invoice_draft. Retry the original invoice input with the same idempotencyKey after setup.";
      } else {
        const code = error instanceof z.ZodError ? "INVALID_INPUT"
          : (error instanceof DraftError || error instanceof PublicationError || error instanceof IdentityError) && safeCodes.has(error.code) ? error.code : "INTERNAL_ERROR";
        result = { code };
        if (params.name === "save_sender_profile" && ["PROFILE_CONFLICT", "REVISION_CONFLICT"].includes(code)) {
          result.guidance = "Read the current sender profile again and obtain fresh approval before saving with its id and revision.";
        }
        if (error instanceof DraftError && code === "VERSION_CONFLICT") {
          result.draftId = error.details.draftId; result.currentVersion = error.details.currentVersion;
        }
      }
      return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    }
  });
  return server;
}

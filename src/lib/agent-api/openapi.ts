import { z } from "zod";
import { ACCOUNT_SCOPES, operationNames, operationSchemas, operationScopes, type AgentAccount, type AgentOperation } from "./contracts";

const accountAuth = "X-Payr-Service-Key is always required. Also supply exactly one account credential: Authorization: Bearer <pac_UUID.secret> OR the top-level accountCredential body string, never both. The service-key-only OpenAPI security alternative is valid ONLY when accountCredential is supplied in the body; it is not account-free access. Workspace identity and scopes come from the account credential, not input. Caller header forwarding through Bazantic remains externally unverified.";
const secretHandling = "Keep service keys and account credentials out of prompts, URLs, recordings, logs, shared recipes, and the public specification. Prefer private header injection. The body fallback is model-visible if generated tool arguments cannot be hidden; writeOnly/password annotations do not hide it. Use short-lived, least-privilege scoped credentials and a trusted secret-injection path; do not ask the user to paste a credential into chat.";
const registrationAuth = "X-Payr-Service-Key is required even for registration. Authorization and accountCredential are forbidden; send only the required JSON envelope {input:{...}}.";

const catalog: Record<AgentOperation, { summary: string; description: string; example: object; result: string }> = {
  create_account_challenge: {
    summary: "Request a wallet-bound account registration challenge",
    description: "With the wallet owner's approval, request a short-lived, single-use registration challenge. The owner must review the exact message and sign locally with their EOA wallet; never request a private key, seed phrase, or remote signing custody. The challenge binds registration purpose, wallet, service, domain/URI, chain, scopes and credential lifetime. Choose the minimum scopes needed; invoice:status is mandatory, scopes must be unique, and expiresInDays is an integer from 1 to 7 (default 1). This does not register the account or authorize spending.",
    example: { wallet: "0x1111111111111111111111111111111111111111", scopes: ["invoice:status"], expiresInDays: 1 },
    result: "Registration challenge for local EOA signing: challengeId, message (sign these exact bytes), expiresAt, scopes and expiresInDays. Treat it as single-use.",
  },
  register_account: {
    summary: "Register using the owner's locally signed challenge",
    description: "Submit the signature of the exact, unexpired account-registration challenge after the wallet owner approves its purpose, scopes and lifetime. Signing must occur locally in the owner's EOA wallet. The challenge is single-use and service-bound, not a login or spending authorization. An existing wallet returns its existing workspace and a newly issued account key, not a duplicate workspace. The pac_ account credential is returned only once: capture it directly into private credential storage, not chat or recordings. Do not blindly replay a consumed challenge to recover a lost key. New account keys are gateway-only regardless of the cutover flag. Payout is immutable through this API.",
    example: { challengeId: "00000000-0000-4000-8000-000000000001", signature: `0x${"0".repeat(130)}` },
    result: "Object with account (AgentAccount metadata) and accountCredential (new pac_ secret, shown once). Store accountCredential privately before continuing. Existing wallets reuse their workspace.",
  },
  get_account: {
    summary: "Read the current account and credential metadata",
    description: "Read the authenticated workspaceId, ownerWallet, current credential metadata and senderSetupRequired. Credential metadata is not a new secret or a list of other keys. Use get_sender_profile to resolve missing sender facts. This read does not grant payout authority or change account setup.",
    example: {},
    result: "AgentAccount: workspaceId, ownerWallet, credential metadata (not the raw secret), and senderSetupRequired.",
  },
  revoke_current_credential: {
    summary: "Revoke only the credential authenticating this request",
    description: "Obtain explicit user approval before sending approval:true. Revoke only the current account credential; no credentialId, workspaceId or other target is accepted. This is not bulk revocation or service-key administration. Subsequent calls with the revoked key fail authentication; a retry after an uncertain result may therefore fail rather than replay success.",
    example: { approval: true },
    result: "Revocation acknowledgement containing credentialId and revoked:true for the current credential only.",
  },
  get_sender_profile: {
    summary: "Read sender setup and its current revision",
    description: "Read profile, missingFields and guidance before sender setup or an update. Use the returned profile id and revision for save_sender_profile. Missing facts must be confirmed with the user, never invented. Reading payoutWallet does not grant authority to change it; payout is immutable through the agent API.",
    example: {},
    result: "Canonical sender result: profile (including id, revision and nullable setup fields), missingFields entries with path/reason, and guidance. This is not a flat SenderProfile response.",
  },
  save_sender_profile: {
    summary: "Save explicitly approved sender fields with revision checking",
    description: "Obtain explicit user approval of ALL business, contact and address fields, invoice prefix and default payment terms before setting approval:true. Supply expectedProfileId and expectedRevision from get_sender_profile. This is a non-idempotent compare-and-swap (CAS) save, not a patch or idempotency-key operation. After a timeout, uncertain result, PROFILE_CONFLICT or REVISION_CONFLICT, read the profile again and obtain fresh approval before another save; never retry blindly. Payout is immutable through this API and requires an owner-signed dashboard action. Never include wallet, actor or workspace fields.",
    example: {
      expectedProfileId: "00000000-0000-4000-8000-000000000002", expectedRevision: 1, approval: true,
      businessName: "Example Studio", billingAddress: { line1: "1 Example Street", city: "London", postalCode: "SW1A 1AA", countryCode: "GB" },
      contactName: "Example Sender", contactEmail: "sender@example.com", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
    },
    result: "Canonical sender result: profile, missingFields and guidance, with the saved profile's current revision. Additional service outputs remain allowed.",
  },
  create_invoice_draft: {
    summary: "Create or revise a draft from confirmed invoice facts",
    description: "Gather confirmed billing facts and exact decimal USDC strings, never floating-point amounts. Missing facts return MISSING_FIELDS with draftCreated:false and missingFields; no draft write occurs. Ask for missing facts rather than inventing them. Payr does not search: proposed client facts require confirmed:true and user_provided or URL-bearing web_source provenance; saved_profile is server-owned. Revisions require draftId and expectedVersion together. Dates must be real YYYY-MM-DD dates from year 2000, dueDate must not precede issueDate, and amounts and technical deadlines must fit service bounds. Sender/payout overrides are forbidden. Review the complete preview, applied defaults and proposed client-profile diff before separate publication approval. No invoice number, document, access link or client-profile save is created by drafting. Retry with the same idempotencyKey and unchanged input, including after completing missing sender setup; changed-input key reuse conflicts once recorded. A genuinely revised request needs its own key and current version.",
    example: { idempotencyKey: "example-draft-1", client: { alias: "confirmed-example-client" }, items: [{ description: "Approved development work", amount: "100.00" }], issueDate: "2026-09-09", dueDate: "2026-10-09" },
    result: "DraftResult: code:DRAFT_READY, draftCreated:true, draftId, version, structured preview, previewText, canonicalInvoiceJson and approvalInstruction. MISSING_FIELDS is not a successful draft write.",
  },
  list_invoices: {
    summary: "List a bounded page of invoices in this workspace",
    description: "Read at most 50 invoice summaries per page, with items and hasMore. Search is trimmed, at most 200 characters and contains no control characters. Optional state filters commercial state, not settlement or email state. Offset is an integer from 0 to 10000, default 0; there is no caller-controlled limit. Advance by 50 only while hasMore is true and the next offset stays within 10000; narrow the search rather than exceeding the bound. This does not return full invoice details or the complete lifecycle status.",
    example: { search: "", offset: 0 },
    result: "InvoicePage: items (up to 50 InvoiceSummary records) and hasMore:boolean. Summary monetary amounts are decimal/atomic strings or null, not numbers.",
  },
  get_invoice: {
    summary: "Read invoice details and draft-version history",
    description: "Read one invoice in the authenticated workspace: invoice summary, current version (possibly null), and version history. Use this for invoice facts and review, not as a substitute for get_invoice_status. Despite the get_ name, the HTTP method is POST with input.invoiceId in the required JSON envelope; no credentials or IDs belong in a query string. No write or publication is performed.",
    example: { invoiceId: "00000000-0000-4000-8000-000000000003" },
    result: "InvoiceDetail: invoice (InvoiceSummary), version (DraftVersion or null, not an integer), and history entries containing id, version and createdAt.",
  },
  publish_invoice: {
    summary: "Publish the exact invoice draft the user approved",
    description: "Obtain explicit user approval of this exact draftId and expectedVersion, every resolved fact/default and the proposed client-profile diff before sending approval:true. Draft preparation is not publication approval. Retry a timeout, PUBLICATION_IN_PROGRESS or PUBLICATION_RETRYABLE with the same idempotencyKey and unchanged input; back off and honor Retry-After on 429. Never change the key to bypass a failure. Version/profile conflicts require a fresh review and approval, not silently adopting newer facts. Publication returns invoice/PDF links and gmailLinkPackage, but does not send email or authorize spending; sending needs separate approval. Links and customer data are private. A completed replay returns current commercial state and need not be currently payable. Paid status requires reconciliation-derived persisted settlement, never a wallet callback or transaction hash alone.",
    example: { draftId: "00000000-0000-4000-8000-000000000003", expectedVersion: 1, approval: true, idempotencyKey: "example-publish-1" },
    result: "Canonical publication result: invoiceId, invoiceVersion, invoiceNumber, commercialState, invoiceUrl, invoicePdfUrl, pdfFilename, pdfContentHash, documentCommitment, gmailLinkPackage and sendApprovalRequired:true. gmailLinkPackage is an object with to (array), subject, textBody, htmlBody, paymentUrl and invoicePdfUrl, not a string or sent email.",
  },
  get_invoice_status: {
    summary: "Read canonical settlement, document and delivery status",
    description: "Read the complete canonical lifecycle status for this workspace's invoice, distinct from get_invoice details/history. Keep commercialState, persisted settlement, invoice document readiness, receipt readiness and receiptEmail provider acceptance separate. Only reconciliation-derived persisted settlement establishes paid status; a wallet callback or transaction hash alone is not proof, and email provider acceptance is not inbox delivery. Receipt and receiptEmail are structured objects, not status strings. Document links and recipient delivery details are private. This read does not send, reconcile or execute a payment. Despite the get_ name, use POST and the required input envelope.",
    example: { invoiceId: "00000000-0000-4000-8000-000000000003" },
    result: "Canonical payr.invoice-status.v1 object: invoice identity/version, commercial/payment/display states, payableUntil, nullable settlement/explorer/invoiceDocument, receipt object and receiptEmail object with deliveries. Additional canonical service fields are preserved.",
  },
};

export function buildAgentOpenApi(origin: string) {
  const accountProperties = {
    workspaceId: { type: "string" }, ownerWallet: { type: "string" }, senderSetupRequired: { type: "boolean" },
    credential: {
      type: "object", additionalProperties: true,
      required: ["id", "createdAt", "expiresAt", "revokedAt", "lastUsedAt", "scopes"],
      properties: {
        id: { type: "string" }, createdAt: { type: "string" }, expiresAt: { type: "string" },
        revokedAt: { type: ["string", "null"] }, lastUsedAt: { type: ["string", "null"] },
        scopes: { type: "array", items: { type: "string", enum: [...ACCOUNT_SCOPES] } },
      },
      description: "Current credential metadata only; never the raw account secret.",
    },
  } satisfies Record<keyof AgentAccount, object>;

  return {
    openapi: "3.1.0",
    info: {
      title: "Payr Agent API", version: "1.0.0",
      description: `Eleven initially free gateway operations for wallet-approved account registration, sender setup and invoicing. No verified paid x402 integration is claimed. Every upstream operation requires the private Bazantic service key, including registration. Account operations additionally require their own scoped account credential. ${secretHandling} Request schemas derive from canonical Zod input schemas; runtime refinements (including dates, amounts, country codes and provenance URLs) remain authoritative. Response descriptions follow canonical services; open response schemas deliberately do not invent nested DTO types.`,
    },
    servers: [{ url: origin }],
    security: [{ serviceKey: [] }],
    components: { securitySchemes: {
      serviceKey: {
        type: "apiKey", in: "header", name: "X-Payr-Service-Key",
        description: "Private Bazantic service key (pgw_ prefix), provisioned by an operator and injected server-side on EVERY upstream call. Never a user/tool argument. It does not itself authorize an account operation.",
      },
      accountBearer: {
        type: "http", scheme: "bearer", bearerFormat: "pac_UUID.secret",
        description: `Scoped Payr account credential. Mutually exclusive with body accountCredential. The service key is still required. ${secretHandling}`,
      },
    } },
    paths: Object.fromEntries(operationNames.map((operation) => {
      const entry = catalog[operation];
      const scope = operationScopes[operation];
      const input = z.toJSONSchema(operationSchemas[operation], { io: "input" });
      // Zod refinements are not emitted by toJSONSchema; preserve representable cross-field constraints.
      if (operation === "create_account_challenge") {
        Object.assign(input.properties!.scopes, { uniqueItems: true, contains: { const: "invoice:status" } });
      }
      if (operation === "create_invoice_draft") {
        input.dependentRequired = { draftId: ["expectedVersion"], expectedVersion: ["draftId"] };
      }
      return [`/api/v1/${operation}`, { post: {
        operationId: operation, summary: entry.summary,
        description: `${entry.description} ${scope ? `${accountAuth} Required account scope: ${scope}.` : registrationAuth} ${secretHandling}`,
        // OpenAPI has no body security scheme or header/body XOR. The second alternative is conditional, not anonymous.
        security: scope ? [{ serviceKey: [], accountBearer: [] }, { serviceKey: [] }] : [{ serviceKey: [] }],
        "x-account-credential": scope ? {
          required: true, mutuallyExclusive: true,
          alternatives: [{ in: "header", name: "Authorization", scheme: "bearer" }, { in: "body", name: "accountCredential" }],
          scopes: [scope],
        } : { required: false, forbidden: ["Authorization", "accountCredential"] },
        requestBody: {
          required: true,
          description: scope ? accountAuth : registrationAuth,
          content: { "application/json": {
            schema: {
              type: "object", additionalProperties: false, required: ["input"],
              properties: {
                ...(scope ? { accountCredential: {
                  type: "string", format: "password", writeOnly: true, "x-sensitive": true,
                  description: `Raw pac_UUID.secret account token, without the Bearer prefix. Required only when Authorization is absent; forbidden when Authorization is present. ${secretHandling}`,
                } } : {}),
                input,
              },
            },
            example: { input: entry.example },
          } },
        },
        responses: {
          "200": { description: entry.result, content: { "application/json": { schema: operation === "get_account"
            ? { type: "object", additionalProperties: true, required: Object.keys(accountProperties), properties: accountProperties }
            : { type: "object", additionalProperties: true } } } },
          default: {
            description: "Sanitized failure. Inspect the returned code; do not infer success from a transport retry. Authentication/authorization failures require credential or scope correction. Conflicts require review; missing draft facts cause no write. Honor Retry-After when rate limited. Error details remain service-owned.",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          "429": {
            description: "Rate limited; wait for Retry-After before retrying an otherwise safe request.",
            headers: { "Retry-After": { description: "Delay in seconds", schema: { type: "integer", minimum: 1 } } },
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
        },
      } }];
    })),
  };
}

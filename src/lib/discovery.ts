import { parsePublicEnv } from "../config/env";
import { PAYR_GATEWAY_MCP_URL } from "./payr-connection";

export function discoveryOrigin() {
  return parsePublicEnv({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://payrlink.xyz" }).NEXT_PUBLIC_APP_URL;
}

export const discoveryLinks = [
  '</index.md>; rel="alternate"; type="text/markdown"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</docs/api.md>; rel="service-doc"; type="text/markdown"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</.well-known/ai-catalog.json>; rel="ai-catalog describedby"; type="application/ai-catalog+json"',
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
].join(", ");

export const homepageMarkdown = `# Payr: From finished work to verified payment

USDC invoicing for independent developers on Arc Testnet. Connect confirmed billing details, protected payment links, and invoice-linked settlement proof.

## One record, from start to settled

1. Confirm: Save your sender profile, clients, payout wallet, and payment terms. Draft from confirmed facts. Connect Claude separately through Payr Connections; creating a credential does not connect Claude automatically.
2. Publish & Send: Review the exact draft, defaults, client changes and both snapshot email addresses. When invoice email is enabled, approve publication and delivery together; Payr freezes the invoice and queues its PDF and private links to the client and sender. Do not send a duplicate via Gmail. Disabled email blocks fresh publication.
3. Pay: Your client reviews the amount and payee and approves USDC payment in their own wallet. No Payr account is required. Connecting a wallet is never permission to pay.
4. Verify: Payr matches onchain settlement to the invoice's exact amount, payee, and commitment. A transaction hash alone is not payment proof.
5. Receipt: Verified settlement creates a linked receipt and PDF. Receipt delivery has separate progress; automatic sending remains disabled.

## Private by design

Invoice contents stay offchain. Anyone with a live protected link can open it. The settlement contract enforces amount, payee, authorization expiry, and one settlement per invoice.

## Availability

Workspace and client setup, invoice tools for Claude, protected PDFs and payment links, client wallet payments, reconciliation, and linked receipts are implemented on Arc Testnet. This is testnet software, not a mainnet financial service.

The complete live Claude and external-wallet journey, human inbox receipt checks, and unattended delivery are still being verified. One approved receipt email has been verified as delivered by the provider. Automatic receipt sending remains disabled.

[Connect your agent](/install) | [Go To Dashboard](/app) | [API documentation](/docs/api.md) | [Authentication and connector setup](/auth.md)
`;

export const authMarkdown = `# Payr auth.md

For agents and MCP clients connecting to a human-authorized Payr workspace. Start with the MCP connection guide at /install. The optional plugin is archived, not required. Payr does not operate an OAuth/OIDC authorization server or support autonomous agent registration.

## Gateway connection

The public gateway MCP endpoint is ${PAYR_GATEWAY_MCP_URL}. Adding it enables tool discovery, not workspace access. Sign in through Privy and create a REST gateway connection in /app/connections for the operator-registered service. Its account credential must be supplied through an operator-configured private credential path, separately from the gateway operator's service key. Private credential injection and authenticated Claude/Cowork execution still need operator setup and verification. Never paste credentials into chat or model-visible tool arguments. If the private credential path is unavailable, stop at "Workspace access pending" and ask the operator to complete setup.

The source gateway catalog at /openapi/agent.json is not proof of the live imported catalog. The currently imported gateway catalog lacks get_account_context; wallet discovery requires a catalog refresh, explicit wallet:read permission and the service operation scope. Verify access with the read-only get_account tool only after private authentication is configured, and ask the owner to confirm the returned workspace. Never request the gateway service key or invent OAuth or header-forwarding support. Gateway account credentials cannot be used as direct MCP credentials.

## Direct MCP setup (where enabled)

1. Open /app on the Payr origin and select Login to sign in through Privy. The browser receives an origin-bound, HttpOnly session cookie. Never give an agent your wallet key or session cookie. Existing owners can link their workspace with the original owner wallet; linking preserves invoices, payout and credentials.
2. Configure your sender profile and payout details in /app/settings.
3. Open /app/connections and explicitly create a workspace-scoped connector credential. The first-party console provisions it through POST /api/connectors with expiresInDays and optional scopes, using the owner's session and same-origin protections. Agents must ask the owner to do this, not extract browser cookies or silently create credentials. Copy the credential when shown; it is shown only once.
4. For clients supporting custom headers, use the stable Streamable HTTP endpoint /api/mcp on this origin, with Authorization: Bearer <connector credential>. The credential is the value from Copy credential, not the full private endpoint URL. Clients that cannot set headers may continue using their existing private /api/mcp/<credential> URL. Creating a credential does not connect a client automatically.

The connector credential is not an OAuth access token. Keep credentials, Authorization headers, and legacy private endpoint URLs out of chat, public manifests, screenshots, logs, and DNS. Use HTTPS. Credentials expire within 30 days. The owner can revoke a credential in Connections (the console uses POST /api/connectors/<id>/revoke); to rotate, create a replacement, update the client, then revoke the old credential. Expired or revoked credentials return 401; ask the owner to renew rather than retrying indefinitely.

## Authorization boundaries

Default direct connections authorize create_invoice_draft, publish_invoice, get_invoice_status, and void_invoice. Gateway connections do not include void authority. New connections can separately opt into Direct Chat Setup: get_sender_profile requires sender:read and save_sender_profile requires sender:write. Existing connections remain invoice-only. Tool discovery is not a permission grant. Sender saves require explicit approval of all fields and the current profile id/revision; after an uncertain result or conflict, read again rather than retrying blindly. Payout changes always require an owner signature in Payr Settings. Optional wallet:read grants address discovery only, never signing or spending.

Publish & Send requires explicit approval of the exact version, defaults, client changes and both snapshot email recipients, with approval:true and deliveryApproval:true. Refresh/reimport stale tool schemas before activation. Payr queues those specific invoice emails; do not send another through Gmail. Historical no-send approvals are not upgraded. Voiding has its own approval, and payments remain under the client's wallet control.

Invoice and receipt links are separate, purpose-specific bearer credentials, not API registration credentials. Browser sign-out clears the local session cookie; revoke connector credentials separately.

See /docs/api.md and /.well-known/agent-skills/index.json for supported integration details.
`;

export const apiMarkdown = `# Payr API and MCP

Payr is USDC invoicing software on Arc Testnet, not a mainnet financial service.

## Public liveness API

GET /api/health returns application/json with status ("ok") and commit (deployment SHA or null). It requires no authentication. It reports application liveness only, not database, RPC, email, or MCP readiness. The OpenAPI description at /openapi.json covers only this endpoint, not Payr's internal workspace APIs.

## Private MCP integration

For the gateway-first flow, see /install and /auth.md. The gateway at ${PAYR_GATEWAY_MCP_URL} exposes its own catalog; public discovery is not workspace authentication. The source /openapi/agent.json composes 12 operations, but the currently imported gateway catalog lacks get_account_context. It must be refreshed for wallet discovery and the current Publish & Send contract before activation. Workspace access requires an operator-configured private credential path and separately scoped service key; never put either secret in chat or model-visible tool arguments. Optional get_account_context requires explicit wallet:read permission and the service operation scope, and never permits signing or spending. Confirm the actual tools through discovery, not the source operation count.

The following describes the separate direct MCP transport. Deployments with PAYR_AGENT_GATEWAY_ONLY=true reject direct MCP calls; use the gateway flow on those deployments. No plugin is required for either transport.

Complete the Privy sign-in and connector setup in /auth.md. Use POST /api/mcp with Authorization: Bearer <connector credential>. The URL is public; all protocol operations, including initialize and tools/list, require an authorized credential. Missing, expired, or revoked credentials return 401 with a Bearer challenge. This is connector-token authentication, not OAuth. Existing /api/mcp/<credential> URLs remain supported for clients without custom header support.

The server uses stateless Streamable HTTP with POST JSON responses, no SSE stream, session resume, or request batching. Authenticated non-POST methods return 405. Admission limits and origin checks apply to both transport URLs. Never pass credentials through query parameters or session cookies.

Invoice tools: create_invoice_draft, publish_invoice, get_invoice_status, void_invoice. Direct Chat Setup also offers get_sender_profile and save_sender_profile, requiring separately opted-in sender:read and sender:write scopes. Default and existing connections remain invoice-only; discovery is not permission. Sender saves require explicit approval and optimistic concurrency checks. Publish & Send requires approval:true and deliveryApproval:true of the exact reviewed version and both snapshot email recipients. It queues one message per distinct address with the frozen PDF and links. invoiceEmail tracks provider acceptance separately from receiptEmail and payment; sent is not inbox delivery. Do not send duplicate Gmail messages. No arbitrary email, payment, search, payout, or connector-management authority is granted. Void requires separate exact-version approval.

The portable workflow skill is published at /.well-known/agent-skills/payr-create-invoice/SKILL.md. The experimental MCP card at /.well-known/mcp/server-card.json describes the stable endpoint and required secret header input. /.well-known/mcp.json is a legacy card for older discovery clients. Neither contains a real credential. Tool capabilities are discovered at runtime after authentication.

Workspace HTTP APIs are first-party browser interfaces, not a supported third-party OAuth API. Do not extract session cookies or crawl private invoice, receipt, or connector URLs.
`;

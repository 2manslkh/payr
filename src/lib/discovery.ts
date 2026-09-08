import { parsePublicEnv } from "../config/env";

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
2. Publish: Approve the exact draft. Payr freezes the invoice, assigns its number, and creates a downloadable PDF and protected payment link.
3. Pay: Your client reviews the amount and payee and approves USDC payment in their own wallet. No Payr account is required. Connecting a wallet is never permission to pay.
4. Verify: Payr matches onchain settlement to the invoice's exact amount, payee, and commitment. A transaction hash alone is not payment proof.
5. Receipt: Verified settlement creates a linked receipt and PDF. Receipt delivery has separate progress; automatic sending remains disabled.

## Private by design

Invoice contents stay offchain. Anyone with a live protected link can open it. The settlement contract enforces amount, payee, authorization expiry, and one settlement per invoice.

## Availability

Workspace and client setup, invoice tools for Claude, protected PDFs and payment links, client wallet payments, reconciliation, and linked receipts are implemented on Arc Testnet. This is testnet software, not a mainnet financial service.

The complete live Claude and external-wallet journey, human inbox receipt checks, and unattended delivery are still being verified. One approved receipt email has been verified as delivered by the provider. Automatic receipt sending remains disabled.

[Sign in to Payr](/login) | [API documentation](/docs/api.md) | [Authentication and connector setup](/auth.md)
`;

export const authMarkdown = `# Payr Authentication

Payr does not operate an OAuth/OIDC authorization server and does not support autonomous agent registration.

## Human setup

1. Open /login on the Payr origin and sign the short-lived wallet challenge. The browser receives an origin-bound, HttpOnly session cookie. Never give an agent your wallet key or session cookie.
2. Configure your sender profile and payout details in /app/settings.
3. Open /app/connections and explicitly create a workspace-scoped connector credential. Copy the private MCP URL when shown; it is shown only once.
4. Configure your MCP client with that exact URL using Streamable HTTP. Creating the credential does not connect a client automatically.

The credential is embedded in the URL path, not an OAuth access token. Treat the entire URL as a secret. Never put it in chat, public manifests, screenshots, logs, or DNS. Credentials expire within 30 days. Revoke a credential in Connections; to rotate, create a replacement, update the client, then revoke the old credential.

## Authorization boundaries

The connector exposes create_invoice_draft, publish_invoice, get_invoice_status, and void_invoice only. Publishing and voiding require explicit approval of the exact version. Publishing is not permission to send email or pay. Payments remain under the client's wallet control.

Invoice and receipt links are separate, purpose-specific bearer credentials, not API registration credentials. Browser sign-out clears the local session cookie; revoke connector credentials separately.

See /docs/api.md and /.well-known/agent-skills/index.json for supported integration details.
`;

export const apiMarkdown = `# Payr API and MCP

Payr is USDC invoicing software on Arc Testnet, not a mainnet financial service.

## Public liveness API

GET /api/health returns application/json with status ("ok") and commit (deployment SHA or null). It requires no authentication. It reports application liveness only, not database, RPC, email, or MCP readiness. The OpenAPI description at /openapi.json covers only this endpoint, not Payr's internal workspace APIs.

## Private MCP integration

Complete the human wallet and connector setup in /auth.md. Each workspace receives its own secret endpoint URL. The server uses stateless Streamable HTTP with POST JSON responses, no SSE stream, session resume, or request batching. Tool discovery requires a valid connector credential; there is no public credential-free MCP endpoint.

Available tools: create_invoice_draft, publish_invoice, get_invoice_status, void_invoice. Discover the live schemas through the authenticated connector. Publication and void require explicit approval of the exact version. No payment, email-sending, search, profile, payout, or connector-management authority is granted.

The portable workflow skill is published at /.well-known/agent-skills/payr-create-invoice/SKILL.md. The experimental MCP card at /.well-known/mcp/server-card.json advertises identity and setup documentation only; it deliberately omits private connection endpoints.

Workspace HTTP APIs are first-party browser interfaces, not a supported third-party OAuth API. Do not extract session cookies or crawl private invoice, receipt, or connector URLs.
`;

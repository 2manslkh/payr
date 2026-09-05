# Payr Framing and Design

Status: Approved implementation baseline
Date: 2026-09-04
Last revised: 2026-09-05
Owner: Lim Keng Hin (product and engineering)
Presentation and submission: Chanita Inthathong

## Executive verdict

Build Payr: an agent-native invoicing service for independent developers that turns a short instruction plus confirmed business and client profiles into a complete commercial invoice, protected payment link, and PDF, then reconciles verified Arc USDC settlement into a tamper-evident receipt and delivers it automatically.

The service provider is the only primary user. The client is a necessary bill-to party and payer, not a second product persona. The service provider's agent gathers confirmed information, creates the invoice through Payr, and prepares a Gmail message. The service provider approves publication and email separately. The client always controls the payment transaction.

The remembered three-minute claim is:

> A freelancer can go from one instruction to a complete PDF invoice and payment link, then receive an automatically reconciled receipt after real USDC settlement.

## 1. Starting point and constraints

- ETHOnline 2026 runs from 4–16 September 2026.[1]
- The exact submission cutoff time and timezone have not yet been verified from the participant dashboard. This must be confirmed before submission planning.
- Keng is the sole engineer and owns product decisions.
- Chanita owns administration, presentation, and submission preparation.
- Both have a focused 12–4 PM daily work block.
- Code freezes on 15 September so the final period can be used for presentation and submission.
- Keng has approximately 44 focused engineering hours from 4–14 September inclusive.
- The workspace currently contains framing documents and brand assets, but no application code or runnable build.
- The critical path may contain at most one difficult external integration at a time.
- `payrlink.xyz` has been purchased through Vercel. Vercel nameservers and A records have begun resolving, but HTTPS and Resend sender-domain verification are not yet proven.

Single framing outcome: approve one narrow, honest, demo-ready vertical slice before implementation.

Not yet: production-scale infrastructure, autonomous payer custody, multiple chains or tokens, fiat onboarding, tax engines, escrow, accounting integrations, or sponsor features without user value.

## 2. Candidate ranking

The concepts use the project scorecard's eight weighted dimensions: user pain, demo clarity, feasibility, onchain necessity, technical credibility, differentiation, sponsor fit, and post-hackathon potential.

| Rank | Concept | Score | Verdict |
| ---: | --- | ---: | --- |
| 1 | Seller-agent invoice creation with PDF/email delivery and human client payment | 427/500 | Strong but ambitious; proceed with gates |
| 2 | Buyer-agent autonomous accounts payable | 246/500 | Not viable in 44 hours |
| 3 | Generic A2A/A2C invoicing protocol | 127/500 | Reject for this event |

### 2.1 Seller-agent invoice creation

- User: independent developers billing crypto-native international clients.
- Painful moment: gathering client details, formatting and checking invoices, issuing payment instructions, matching transfers, and sending receipts.
- Promise: one instruction becomes a complete PDF invoice, protected payment link, and email-ready package; settlement automatically becomes a linked receipt delivered to both parties.
- Onchain necessity: direct USDC settlement plus shared, independently inspectable proof tying one transfer to one invoice commitment.
- Demo proof: a real Arc payment changes contract and application state before the judge.
- Leading risk: agent-generated documents alone are easy to copy. The differentiated product is the complete issuance-to-reconciliation loop.

### 2.2 Buyer-agent autonomous accounts payable

- Stronger theoretical fit for autonomous-agent prizes.
- Weaker firsthand demand evidence.
- Requires a funded agent wallet, spending policies, a second primary persona, Circle Agent Stack, and materially more security work.
- Rejected because sponsor fit does not rescue product and schedule risk.

### 2.3 Generic A2A/A2C invoicing protocol

- Has a broad future narrative but no narrow first user or painful moment.
- Requires several workflows and relies on narration rather than a single visible outcome.
- Rejected for the hackathon. Agent-to-agent settlement remains a possible later expansion, not an MVP claim.

## 3. Product framing

### One-sentence product

Payr lets an independent developer tell an AI agent whom to invoice, what for, and how much; Payr assembles the confirmed invoice, PDF, and payment link, while verified Arc USDC settlement automatically produces and emails a linked receipt.

### Target user

An independent software developer or freelancer who bills international, crypto-native clients and already has an external wallet.

### Initial payer

A crypto-native client who already holds testnet USDC and can approve a transaction from an existing wallet.

### Painful moment

After completing work, the freelancer must gather legal and address details, format and check an invoice, write payment instructions, monitor a transfer, identify which invoice it paid, and create a receipt. Bank currency limitations can also make the proceeds slow or unusable.

### Core promise

From one short instruction, generate a client-ready invoice preview; after approval, produce an immutable invoice number, protected payment link, downloadable PDF, QR code, and email-ready package. After one client wallet transaction, derive the `Paid` display status from a verified settlement and issue a receipt without manual reconciliation. Payment evidence never overwrites the invoice's separate commercial lifecycle.

### Why Ethereum and Arc are necessary

A normal database can generate an invoice but cannot provide direct ownership of the settled asset or neutral, independently inspectable settlement. Arc moves USDC directly from the client to the freelancer while the contract enforces invoice-specific terms and emits deterministic reconciliation data. Arc uses USDC as its native token and exposes the same underlying balance through an 18-decimal native interface and a 6-decimal ERC-20 interface.[5]

### Document claim

Payr creates a generic commercial invoice/payment request. It does not claim jurisdiction-specific tax compliance or legal sufficiency.

## 4. Scope

### Included in the vertical slice

- Wallet-signature login for the freelancer.
- One saved sender profile with default payment terms.
- One or more saved client profiles; the demo uses one preloaded client.
- Structured missing-field responses so the host agent can ask the service provider for information.
- One invoice currency and settlement asset: USDC on Arc.
- Prompt-driven draft creation through a remote MCP connector.
- Deterministic server-side validation and rendering.
- Separate human approvals for invoice publication and email sending.
- Crash-safe publication with immutable sequential numbering, idempotency conflict detection, leased recovery, and no reuse of failed numbers.
- Revocable high-entropy `https://payrlink.xyz/invoice/<slug>` payment link with no client login; its slug is reproducible from stored non-secret metadata and a versioned server secret.
- Server-generated invoice PDF, protected PDF URL, served-byte content hash, and embedded QR code, with page/PDF parity.
- One native-USDC settlement contract.
- One signer interface and isolated testnet signer capable of producing the contract's Payr EIP-712 authorization.
- Short-lived payment authorization issued only when the client presses Pay Now.
- Settlement-derived `Paid` status, receipt page, and receipt PDF, including valid events reconciled after commercial void or expiry.
- One durable logical receipt-email delivery per normalized confirmed address through Resend, preserving all party roles.
- An exact Gmail link package returned independently of Gmail availability; connector send and PDF attachment remain optional enhancements.
- Portable `SKILL.md` documenting how API-capable agent hosts should use Payr safely.
- Claude as the primary demo client because it supports remote MCP custom connectors.[2]

### Conditional enhancements outside the committed schedule

- Host-agent web search for public client fields, only after user approval; every suggestion carries a source and requires confirmation.
- Claude Gmail draft/send after separate approval, and PDF attachment only if independently proven.[10]
- The Privy signer adapter and prize claim, only if the captured actual wire shape and required policy allow/deny matrix pass.[11][13]
- Bazantic gateway/recipe, only after every core acceptance criterion passes.

### Explicit non-goals

- Autonomous payer agent or any agent-controlled spending.
- A2A negotiation or machine procurement.
- Mainstream client onboarding, card payment, or fiat conversion.
- Multiple chains, stablecoins, or settlement assets.
- Escrow, milestones, disputes, refunds, partial payments, tips, or overpayments.
- Automated invoice-email delivery by Payr, reminders, or debt collection. The service provider's agent sends the initial Gmail message after approval.
- Accounting-suite integration.
- Tax calculation or jurisdiction-specific invoice compliance.
- Public invoice contents, invoice NFTs, or token issuance.
- Dual-party EIP-712 invoice acknowledgment or a fake PDF "Sign here" control.
- Automatic Gmail PDF attachment unless a live connector spike proves it.
- Agent authority to change sender identity or payout wallet.
- Unsourced or automatically accepted web-search data.
- Privy integration that cannot demonstrate an enforced typed-data policy.

## 5. User journey

### Freelancer setup

1. Connect an external wallet and sign the exact server-defined login message.
2. Save a sender profile with business name, address, contact details, payout wallet, invoice prefix, and default payment terms.
3. Save a client profile with business name, billing address, and contact details.
4. Create a revocable agent connector for that workspace.

Sender identity and payout-wallet changes are dashboard-only. Changing the payout wallet requires a fresh purpose-bound signature from the workspace owner's wallet over the old and new payout addresses. The agent may propose client-profile changes but cannot silently overwrite confirmed fields.

The main demo starts after setup with one sender and one client already saved. Missing-information search is demonstrated separately only if the core flow is stable.

### Agent invoice creation

1. Freelancer writes: "Invoice Circle 1,000 USDC for building the frontend website."
2. The agent calls `create_invoice_draft` with strict structured fields; the schema permits partial business input but rejects unknown keys, wrong types, and prohibited sender or payout properties.
3. Payr loads the authenticated sender and client profiles.
4. When the prompt omits a due date, Payr applies the sender's saved default payment terms and highlights the applied default in the draft.
5. If required data is missing, Payr returns `MISSING_FIELDS` with field paths and reasons and creates no draft. Partial input is therefore useful for elicitation without becoming permissive input validation.
6. With separate user approval, the host agent may search for missing public client fields. It presents source URLs, never infers email or wallet addresses, and passes only user-confirmed values to Payr. The only accepted inbound provenance values are `user_provided` and `web_source`; `saved_profile` is added only by Payr when it loads server-side data.
7. Payr validates issuer, client, line items, exact USDC amounts, dates, payout wallet, and optional confirmed client-profile changes.
8. Payr returns a complete structured preview showing all defaults and proposed profile changes.
9. The service provider approves or revises the draft. A revision calls the same `create_invoice_draft` tool with `draftId` and `expectedVersion`, creating a new version and preserving the four-tool MCP surface.
10. On explicit publication approval, the agent calls `publish_invoice`.
11. Payr starts or resumes a fingerprinted publication attempt, permanently reserves the next workspace invoice number, derives link metadata and an invoice key, renders to attempt-specific create-only storage keys, verifies the stored bytes and hashes, then atomically freezes the approved version and exposes the ready page/PDF. A retry reconstructs the same protected URLs from stored token metadata rather than stored raw URLs.

### Initial email

1. `publish_invoice` always returns this exact link-only object, generated at response time rather than persisted with raw URLs:

```json
{
  "gmailLinkPackage": {
    "to": ["confirmed-client@example.com"],
    "subject": "Invoice <invoiceNumber> from <senderName>",
    "textBody": "<canonical text containing both links>",
    "htmlBody": "<canonical escaped HTML containing both links>",
    "paymentUrl": "https://payrlink.xyz/invoice/<slug>",
    "invoicePdfUrl": "https://payrlink.xyz/invoice/<slug>/pdf"
  }
}
```

2. `to` contains only the confirmed client email, with no inferred recipients; both body forms contain `paymentUrl` and `invoicePdfUrl`, and there are no attachment, CC, BCC, or send fields.
3. Package generation and invoice readiness never call Gmail. Gmail rejection, latency, or outage cannot roll back or fail publication.
4. The service provider separately approves any Gmail send. Claude's Google Workspace connector supports drafting and sending Gmail messages and asks for approval by default.[10]
5. A PDF attachment is attempted only if a live connector smoke test proves arbitrary file attachment support. It is not part of this package or a core acceptance criterion.

### Client payment

1. Client opens the link without creating a Payr account.
2. The page and protected PDF are rendered from the same immutable view model and display the same invoice number, parties, line items, payee wallet, exact USDC amount, dates, Arc network, commitment, and QR destination.
3. The QR code contains the protected HTTPS invoice URL, not raw transaction calldata. It opens the responsive payment page for a supported mobile EVM wallet flow.
4. Client connects an existing wallet.
5. The page computes effective commercial status at request time and requests a short-lived EIP-712 authorization only when status is `published` and server time is strictly before `payableUntil`.
6. The page checks network and shows invoice value separately from estimated USDC gas reserve.
7. Client approves one transaction with the exact native-USDC value.
8. The contract validates and forwards the payment directly to the freelancer.

### Reconciliation and receipt

1. Payr independently retrieves a successful Arc transaction receipt and verifies the exact event against the configured chain, contract, invoice key, frozen invoice version, commitment, payee, and amount.
2. Arc makes a transaction final when its block is committed, so one committed block is sufficient; Payr has no confirmation-depth, reorg, or rollback machinery.[12]
3. A backfill event watcher catches settlements even when the browser callback is lost. Any valid configured-chain/contract event is recorded even when reconciliation happens after commercial void or expiry.
4. An idempotent database transaction inserts the immutable settlement by chain ID, transaction hash, and log index without changing commercial state, creates receipt access-link metadata, one `pending` receipt document, and recipient-deduplicated `pending` email deliveries.
5. A leased worker renders a separate immutable receipt page and PDF from the exact frozen invoice version and verified event, verifies its stored bytes, and activates a separately derived receipt bearer slug.
6. Outbox rows are ineligible to send until the receipt artifact is `ready`; workers then dispatch one logical receipt email per normalized confirmed address. If issuer and client addresses normalize to the same value, one delivery retains both roles.
7. Receipt generation and email delivery run for every verified settlement, including one discovered after void or expiry.
8. `get_invoice_status` exposes the exact settlement-derived status contract defined in section 7.

### Lifecycle edge cases

1. Published invoice versions are never edited or deleted.
2. If no settlement is recorded, the service provider may void a published invoice and create a replacement with a new number, PDF, commitment, and link.
3. Payr never issues a new short-lived payment authorization for a voided invoice.
4. A previously issued short-lived authorization remains a bounded residual risk until it expires; perfect immediate revocation would require an onchain revocation transaction and is outside the MVP.
5. If that authorization settles after `voidedAt`, reconciliation still records the valid event and sets `settledAfterVoid = true`; if an earlier event is merely discovered after voiding, the flag remains false because its block time precedes `voidedAt`.
6. The contract rejects settlement at or after `payableUntil`. A watcher that runs after expiry may still record a final event whose block time was before that boundary.

## 6. System architecture

### Components

1. **Next.js application**
   - Freelancer setup and invoice dashboard.
   - Revocable bearer-link invoice/payment route.
   - Protected invoice-PDF and receipt routes.
   - Pay Now authorization and transaction preparation.
   - API, voiding, and reconciliation handlers.
   - Wallet-signature challenge verification and secure session issuance.

2. **Supabase/PostgreSQL**
   - Private sender/client profiles.
   - Invoice state and immutable versions.
   - Atomic per-workspace invoice sequence.
   - Publication attempts, request fingerprints, recoverable leases, and permanent number reservations.
   - Versioned bearer-token IDs and keyed lookup hashes; hashed connector credentials.
   - Immutable ready artifacts, settlements, and durable delivery records.
   - Idempotent settlement ledger.
   - Composite tenant foreign keys, constrained transitions, row-level access controls, and privileged functions with default caller access revoked.

3. **Canonical Payr API**
   - Owns validation, sourced-field confirmations, state transitions, rendering inputs, commitments, and status.
   - Does not call an LLM.
   - Returns bounded structured results and stable error codes.
   - Fingerprints every mutating request and rejects reuse of an idempotency key with different canonical input.

4. **Remote MCP adapter**
   - Exposes the Payr API to Claude and other compatible MCP clients.
   - Provides four tools: `create_invoice_draft`, `publish_invoice`, `get_invoice_status`, and `void_invoice`.
   - Claude supports publicly reachable Streamable HTTP/SSE MCP connectors and OAuth-capable custom connectors.[2][3]

5. **Portable agent skill**
   - Explains when Payr is appropriate.
   - Gives the host agent responsibility for optional approved web search, source presentation, user confirmation, local PDF download when supported, and Gmail composition.
   - Requires separate approval for publication and sending email.
   - Documents field semantics, defaults, error recovery, and privacy limits.
   - Does not claim every chat product supports the same installation mechanism.

6. **Document renderer**
   - Uses one canonical immutable invoice model for the payment page and PDF.
   - Generates a server-side PDF with a payment-page QR code.
   - Writes only to attempt-specific immutable create-only keys in a private bucket.
   - Returns a protected URL, deterministic filename, content type, exact served-byte size, and content hash.
   - Generates a separate receipt PDF from the frozen invoice and verified settlement.
   - Never exposes a direct storage URL; server routes authorize every page/PDF response.

7. **Attestor interface and conditional Privy adapter**
   - Uses either the isolated testnet signer or, only after acceptance, a policy-controlled Privy server wallet to sign short-lived Payr EIP-712 payment authorizations.
   - Captures the actual `eth_signTypedData_v4` wire request and pins policy rules to its exact type map, primary type, domain name/version, Arc chain, settlement contract, and supported payee/amount/expiry constraints.[11][13]
   - Is enabled only after a live allow/deny matrix proves the deployed policy; acceptance of the Payr MVP never depends on Privy because an isolated testnet signer implements the same interface and payload.

8. **Arc settlement contract**
   - Accepts exact native USDC through `msg.value`.
   - Verifies the short-lived Payr EIP-712 authorization.
   - Prevents duplicate settlement.
   - Forwards funds directly to the freelancer.
   - Emits deterministic settlement metadata.

9. **Reconciler and receipt dispatcher**
   - Reads transaction receipts and contract logs from Arc RPC.
   - Is the only path that can create a settlement; it never changes the commercial lifecycle to `paid`.
   - Treats one committed Arc block as final and uses an idempotent unique settlement key, with no confirmation-depth or reorg state.[12]
   - Inserts a receipt-artifact job and durable outbox work in the settlement transaction.
   - Uses leases, bounded retries, exponential backoff with jitter, and stale-lease recovery for artifacts and email.
   - Normalizes and deduplicates recipients while retaining every issuer/client role on the delivery record.

10. **Conditional external host-agent capabilities**
   - As an enhancement, Claude Gmail drafts/sends the initial invoice message after user approval.[10]
   - As an enhancement, the host agent's own web tool performs optional approved company-data research.
   - These are orchestration capabilities, not Payr data sources or payment authorities.

### Authentication boundary

#### Wallet login and payout changes

- The server creates a single-purpose nonce record containing the encoded random nonce challenge, wallet, purpose, domain, URI, chain ID, issued time, expiry, and operation data. The client returns only the nonce ID and signature; it never supplies a wallet field or authoritative message string.
- For login, the server reconstructs this exact UTF-8 message from the stored challenge and configured origin before signature recovery:

```text
<domain> wants you to sign in to Payr with your Ethereum account:
<checksumOwnerAddress>

URI: <origin>
Version: 1
Chain ID: <decimalChainId>
Nonce: <nonce>
Issued At: <RFC3339 issuedAt>
Expiration Time: <RFC3339 expiresAt>
Request ID: <nonceId>
Purpose: payr-login-v1
```

- For a payout change, the server instead reconstructs this exact UTF-8 message from stored values:

```text
<domain> wants you to authorize a Payr payout change with your Ethereum account:
<checksumOwnerAddress>

URI: <origin>
Version: 1
Chain ID: <decimalChainId>
Nonce: <nonce>
Issued At: <RFC3339 issuedAt>
Expiration Time: <RFC3339 expiresAt>
Request ID: <nonceId>
Purpose: payr-payout-change-v1
Workspace ID: <workspaceId>
Current Payout: <checksumCurrentPayoutAddress>
New Payout: <checksumNewPayoutAddress>
```

- The payout signer must be the current workspace owner's wallet, not the old or new payout wallet merely by virtue of being a payout address.
- Nonce consumption is a conditional database update requiring matching wallet and purpose, `consumedAt IS NULL`, and `now < expiresAt`, in the same transaction that creates the session or changes the payout. Exactly one concurrent verifier can succeed.
- The session cookie is always `__Host-payr-session` with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, and no `Domain`. Never drop `Secure` in development; browsers may apply their localhost exception, otherwise use local HTTPS. These are the host-cookie requirements documented by MDN.[15]

#### Connector shortcut

OAuth is the production target for the remote connector. Anthropic's current custom-connector flow accepts a publicly reachable remote MCP URL and supports OAuth configuration.[2][3] For the hackathon testnet demo only, Payr may place a revocable, high-entropy per-workspace credential in that URL because the connector setup does not provide a general arbitrary-static-header field.[2]

The credential is scoped to drafting, publication, voiding, and status for one testnet workspace. It cannot move money, change sender identity or payout wallets, or expose unrelated workspaces. It may save only client-profile changes shown in the exact draft and approved at publication. The Claude approval turn is a workflow control, not cryptographic proof: a stolen URL credential can act within its scope.

The full credential is displayed exactly once at creation. It has an explicit expiry, per-token and per-IP rate limits, immediate revocation, and audit events containing only token ID, operation, outcome, and redacted request metadata. Application logs and application analytics must redact connector credentials and bearer slugs. This does not guarantee absence from Vercel platform/CDN request metadata or browser history: Vercel runtime logs can expose request paths and search parameters.[18] Revoke and rotate the demo connector immediately after the presentation and before sharing logs or recordings.

#### Invoice and receipt bearer links

Invoice and receipt links are separate revocable credentials. Each slug is `base64url(uuidBytes(tokenId)) + "." + base64url(HMAC-SHA-256(linkKey[keyVersion], "payr:" + purpose + ":v" + keyVersion + ":" + tokenId))`, where the stored token ID is non-secret and purpose is `invoice-bearer` or `receipt-bearer`. The PDF uses the invoice bearer and a `/pdf` suffix. The database stores only token ID, key version, purpose, expiry/revocation state, and `HMAC-SHA-256(linkKey[keyVersion], "payr:bearer-lookup:v1:" + purpose + ":" + slug)`; it never stores a raw slug or URL. The distinct labels provide purpose separation under the versioned link key.

On access, the server parses the token ID, loads its key version, re-derives and constant-time compares the slug and keyed lookup hash, then checks expiry and revocation. On an idempotent API return after a process restart, it re-derives the identical URL from those records. Key rotation retains old key versions only for their bounded token lifetimes. Bearer links protect against guessing, not forwarding. Protected responses use the headers and private-storage controls in section 10.

## 7. Agent tool contracts

`payr:create-invoice` is the user-facing portable-skill workflow. It interprets the request, coordinates approved host-agent search when needed, collects confirmation, and orchestrates the bounded MCP tools below. It is not a fifth backend mutation endpoint.

### `create_invoice_draft`

Inputs:

- client alias or ID, or confirmed fields for a new client
- zero or more line-item descriptions while eliciting missing data
- exact decimal USDC amount for every supplied line item
- issue date, defaulting to the current workspace date
- due date or permission to use the sender's saved default payment terms
- optional memo
- optional proposed client-profile fields, each with provenance (`user_provided` or `web_source`), a source URL when web-sourced, and explicit confirmation
- optional `draftId` and `expectedVersion`, which must appear together when revising
- idempotency key

Behavior:

- Applies a strict schema to every supplied field while allowing required business fields to be absent. Unknown keys and wrong types are invalid, not missing.
- Explicitly rejects any inbound `sender`, `issuer`, `senderProfile`, `payoutWallet`, `payeeWallet`, or `invoicePrefix` property with `PROHIBITED_FIELD`, including nested aliases intended to bypass the boundary.
- Accepts only `user_provided` and `web_source` as inbound provenance. Loads saved profiles server-side and marks those returned fields `saved_profile`; inbound `saved_profile` is rejected.
- If the alias is unknown but a complete confirmed new-client payload is supplied, includes a pending client-profile creation in the draft diff rather than saving immediately.
- Returns `{ "code": "MISSING_FIELDS", "draftCreated": false, "missingFields": [{ "path": "<JSON path>", "reason": "<stable reason>" }] }` without mutation when required data or defaults are unavailable.
- Rejects unconfirmed, conflicting, or prohibited client-profile changes and any web-sourced field without its source URL.
- Never accepts agent changes to sender identity or payout wallet.
- Converts money with decimal-safe code.
- Produces canonical invoice JSON and a rendered preview.
- Shows every applied default and proposed saved-profile change.
- With `draftId` and `expectedVersion`, compare-and-swaps the caller-owned draft and appends a new immutable version; stale revisions return `VERSION_CONFLICT`. This is revision, not a fifth MCP tool.
- Returns draft ID, version, preview, and explicit publication-approval instruction.

### `publish_invoice`

Inputs:

- draft ID
- expected version
- explicit approval flag
- idempotency key

Behavior:

- Rejects stale or incomplete drafts.
- Requires explicit approval of the exact draft version and profile-change diff.
- Computes `requestFingerprint = SHA-256(canonicalJson({operation, workspaceId, draftId, expectedVersion, approval: true}))`. Reusing an idempotency key with the same fingerprint resumes or returns the original attempt; using it with different input returns `IDEMPOTENCY_CONFLICT` and performs no mutation.
- In one privileged database function, verifies ownership/version, enforces one active attempt per invoice/version, permanently consumes the next workspace invoice number, and creates the publication attempt, invoice key, salt, invoice bearer token ID/key version, and lease. The idempotency result stores only resource IDs and state, never a slug or raw URL.
- A partial unique constraint permits only one attempt in `reserved|rendering|stored` for an invoice/version. Workers claim attempts with `leaseOwner` and `leaseUntil`; an expired lease can be recovered without allocating another number or token. Finalization is the atomic transition from `stored` to terminal `finalized`; deterministic terminal failures use `failed`.
- Renders the final PDF and embedded QR from the canonical model, then computes `invoiceDataHash = keccak256(canonicalInvoiceJson)` and `pdfContentHash = keccak256(pdfBytes)`.
- Computes `documentCommitment = keccak256(abi.encode(salt, invoiceDataHash, pdfContentHash))` so settlement binds both the structured invoice and delivered artifact without ambiguous concatenation.
- Uploads to immutable attempt-specific keys such as `workspaces/<workspaceId>/publication-attempts/<attemptId>/invoice.pdf` with create-only semantics. Recovery accepts an existing object only after byte-for-byte hash and size verification; it never overwrites it.
- Before finalization, the service reads the stored object bytes, recomputes size and `pdfContentHash`, verifies the QR destination and expected object identity, and records that verification. The privileged finalization function requires those values to match the attempt, atomically marks the artifact `ready`, freezes the exact invoice version, applies approved client changes, and transitions commercial state `draft -> published`.
- A terminal failed attempt remains auditable, its reserved number is never reused, and no page, PDF, authorization, or Gmail package becomes externally available. A new approved attempt uses a new idempotency key and number.
- Returns the derived invoice URL, protected PDF URL, filename, served-byte content hash, commitment, and exact `gmailLinkPackage` only after finalization. A safe retry, including after restart, re-derives the same URLs from token ID/key version and returns the same finalized resources.

### `get_invoice_status`

Inputs:

- invoice ID

Behavior:

- Computes effective commercial state as described in section 8 before constructing the response; `commercialState` is not a stale persisted `published` value.
- Returns this exact canonical shape with explicit nulls. A submitted transaction, authorization, or browser callback never populates settlement data:

```ts
type InvoiceStatusResult = {
  schemaVersion: "payr.invoice-status.v1";
  invoiceId: string;
  invoiceVersion: number;
  invoiceNumber: string | null;
  commercialState: "draft" | "published" | "voided" | "expired";
  paymentStatus: "unpaid" | "paid";
  displayStatus: "Draft" | "Published" | "Voided" | "Expired" | "Paid";
  payableUntil: string | null;
  settlement: null | {
    chainId: number;
    contractAddress: `0x${string}`;
    invoiceVersion: number;
    transactionHash: `0x${string}`;
    logIndex: number;
    blockNumber: string;
    blockTime: string;
    payer: `0x${string}`;
    payee: `0x${string}`;
    amountDecimal: string;
    amountAtomic: string;
    documentCommitment: `0x${string}`;
  };
  explorer: null | { transactionUrl: string };
  settledAfterVoid: boolean;
  invoiceDocument: null | {
    state: "ready";
    pageUrl: string;
    pdfUrl: string;
    pdfFilename: string;
    pdfContentHash: `0x${string}`;
  };
  receipt: {
    state: "not_applicable" | "pending" | "rendering" | "retry_wait" | "ready" | "failed";
    pageUrl: string | null;
    pdfUrl: string | null;
    pdfFilename: string | null;
    pdfContentHash: `0x${string}` | null;
  };
  receiptEmail: {
    state: "not_applicable" | "queued" | "sending" | "sent" | "failed" | "manual_review";
    deliveries: Array<{
      roles: Array<"issuer" | "client">;
      normalizedRecipient: string;
      state: "pending" | "sending" | "retry_wait" | "sent" | "manual_review" | "failed";
      providerMessageId: string | null;
      attemptCount: number;
      nextAttemptAt: string | null;
    }>;
  };
};
```

- `invoiceNumber` is null until successful publication. `paymentStatus` is `paid` if and only if a verified settlement exists. In that case `displayStatus` is exactly `Paid` regardless of commercial state.
- Settlement integer values that may exceed JavaScript's safe range, including `amountAtomic` and `blockNumber`, are base-10 strings. Addresses and transaction hashes are canonical lowercase `0x` values, `amountDecimal` is a canonical non-exponent USDC decimal string, and `blockTime` is UTC RFC3339.
- With no settlement, `paymentStatus` is `unpaid`, `settlement` and `explorer` are null, `displayStatus` is the title-cased effective `commercialState`, receipt state is `not_applicable`, receipt URLs/hashes are null, and receipt-email state is `not_applicable` with no deliveries.
- `settledAfterVoid` is true if and only if `voidedAt` is non-null and verified `settlement.blockTime > voidedAt`; equality is not "after."
- With settlement, receipt state advances through its durable worker states; only `ready` populates every receipt artifact field. Receipt-email delivery records are visible only to authenticated workspace callers; bearer status projections omit recipient rows and expose only non-sensitive aggregate progress.
- Aggregate receipt-email state precedence is `manual_review`, `failed`, `sending`, `queued`, then `sent`, with `sent` only when every logical delivery is sent. A receipt that is not ready keeps its email deliveries in `pending|retry_wait` and reports aggregate state `queued`.
- Never infers payment from a client-side success message.

### `void_invoice`

Inputs:

- published invoice ID
- expected version
- explicit approval flag
- idempotency key

Behavior:

- Rejects draft, effectively expired, already voided, mismatched-version, or already-reconciled requests. The settlement absence check and `published -> voided` transition are one transaction; payment is not itself a commercial state.
- Sets `voidedAt`, marks the invoice voided, and prevents Payr from issuing any new payment authorization.
- Revokes the invoice and PDF bearer link for ordinary access or renders a minimal non-sensitive Voided page.
- Does not claim to revoke a short-lived authorization already issued to a client; that residual authorization expires naturally. If it settles, the valid event is still recorded, receipted, emailed, and surfaced as `Paid` with `settledAfterVoid` derived from block time.

## 8. Data model and state machine

### Principal records

- `workspaces`: tenant boundary and owner-wallet identity.
- `sender_profiles`: private invoice issuer details, payout wallet, invoice prefix, and default payment terms.
- `clients`: private saved billing profiles and confirmation provenance.
- `invoice_sequences`: atomically allocated next number per workspace/year or configured sequence.
- `invoices`: workspace, client, current and published version IDs, persisted commercial state, immutable successful number, currency, due date, `payableUntil`, `voidedAt`, and version counter; there is no `paid` commercial value.
- `invoice_versions`: append-only canonical JSON snapshots and profile diffs; publication binds exactly one version.
- `publication_attempts`: request fingerprint, idempotency reference, invoice/version, permanently reserved number, invoice key, salt, planned hashes, `reserved|rendering|stored|finalized|failed` state, attempt-specific invoice object keys, immutable finalized artifact facts, and lease/recovery fields.
- `access_links`: non-secret token ID, purpose, secret key version, keyed lookup hash, invoice-version or receipt-document scope, expiry, and revocation; never a raw slug or URL.
- `connector_tokens`: hashed credential, workspace scope, expiry, and revocation state.
- `settlements`: workspace, exact invoice and invoice-version IDs, chain ID, contract, invoice key, transaction hash, log index, commitment, payer, payee, atomic amount, and block time.
- `payment_authorizations`: invoice, attestor, issue/expiry times, and policy result; never treated as settlement.
- `auth_nonces`: encoded random nonce challenge, owner wallet, purpose, exact server message fields, operation hash, issue/expiry, and atomic consumed time.
- `receipt_documents`: settlement, `pending|rendering|retry_wait|ready|failed` state, attempt count, `nextAttemptAt`, lease owner/expiry, last error code, and immutable ready artifact facts.
- `email_deliveries`: settlement/message kind, normalized recipient, all party roles, structured template references, provider key/message ID, `pending|sending|retry_wait|sent|failed|manual_review` state, attempt times, lease fields, and manual-review reason. URLs are derived in worker memory from access-link metadata, never persisted in payload JSON.

### Database enforcement

- Every tenant-owned table carries `workspace_id`. Parent tables expose a unique `(workspace_id, id)` key, and every child uses a composite foreign key `(workspace_id, parent_id)` so a globally valid ID can never cross tenant boundaries. RLS remains defense in depth rather than the only ownership check.
- A frozen publication exposes a unique tuple `(workspace_id, invoice_id, invoice_version_id, invoice_key, chain_id, contract_address, document_commitment, payee, amount_atomic)`. Each settlement has a composite foreign key over that exact tuple, so tenant, version, event commitment, payee, and amount mismatches fail in the database before insertion.
- Triggers reject update/delete of invoice versions once referenced by an attempt, every settlement, every `finalized` publication attempt, and every `ready` receipt document. Object keys are immutable from creation; finalized/ready records cannot be reverted to a mutable state.
- Check constraints and a transition trigger permit only the lifecycle edges below. Settlement insertion is append-only and has unique keys for both `(chain_id, transaction_hash, log_index)` and the published invoice key.
- Atomic numbering, publication reservation/finalization, voiding, nonce consumption, and settlement insertion use narrowly scoped `SECURITY DEFINER` functions in the exposed `public` schema so the server-side Supabase client can invoke them through RPC. Each function has an empty `search_path`, fully qualified relations, and `PUBLIC`, `anon`, and `authenticated` execution revoked in the same migration transaction; only `service_role` receives an explicit grant. PostgreSQL grants function execution to `PUBLIC` by default, and Supabase functions can be reached through RPC unless privileges are restricted.[16][17]
- Therefore the migration globally revokes default function execution from `PUBLIC` for the actual function-owner role (`postgres` in the Supabase migration environment), rather than using an ineffective schema-scoped default revoke. Every privileged function is also explicitly revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role` in its creation transaction. Tests call each function directly through Supabase RPC as `anon` and `authenticated` and prove denial; application endpoint tests alone are insufficient.[17][19]

### Durable post-settlement work

- The settlement-insert transaction also creates exactly one receipt access link, one `pending` receipt document, and one `pending` email delivery per normalized recipient. Unique constraints make replay a no-op and ensure there is no commit in which a settlement exists without its required follow-up work.
- A worker atomically claims eligible `pending|retry_wait` work only when `nextAttemptAt <= now` and no unexpired lease exists, sets a bounded `leaseUntil`, advances it to `rendering` or `sending`, and increments the attempt. A stale `rendering` or `sending` lease is recoverable by another worker.
- Retryable failures move work to `retry_wait` with capped exponential backoff and jitter. Exhausted receipt rendering moves to operator-visible `failed` but remains manually requeueable; email deliveries cannot send until the receipt document is `ready`.
- Immediately before a Resend call, the email delivery becomes `sending` and records `providerAttemptedAt` plus its stable provider key. A stale unknown attempt younger than 24 hours retries the identical payload/key; at 24 hours or older it becomes `manual_review`, because Resend retains idempotency keys for only 24 hours.[14]
- Success stores the provider message ID and `sent`; known provider rejection follows retry/backoff and then `failed`. These application records prevent intentional duplicate work but do not assert transport-level exactly-once delivery.

### Invoice state machine

Commercial lifecycle and payment evidence are orthogonal:

```text
draft -> published -> voided
                   -> expired

paymentStatus = verified settlement exists ? paid : unpaid
displayStatus = paymentStatus == paid ? Paid : titleCase(effectiveCommercialStatus)
```

- `commercial_status` is constrained to `draft|published|voided|expired`; `paid` is not accepted by the database or API as a commercial state.
- Draft revisions append a new version and compare-and-swap `current_version_id`.
- Drafts display `Draft`; an invoice number is reserved only during atomic publication.
- Number reservation occurs when a publication attempt starts. A failed attempt consumes but never publishes or releases its number; only finalization assigns its number to the published invoice.
- Published numbers, the published version, ready artifacts, and settlements are immutable.
- Each published invoice key can settle once; the contract, not the commercial state, prevents a second payment.
- Voided invoices cannot receive new payment authorizations; replacements receive a new number and link.
- Due date is a commercial expectation, not the technical authorization expiry.
- `payableUntil` defaults to 30 days after the due date, allowing late payment while bounding old invoices.
- Boundary semantics use integer Unix seconds: a published invoice is payable only while `serverNow < payableUntil` and is effectively `expired` when `serverNow >= payableUntil`. Every read and mutation computes that effective value even if the expiry sweep has not persisted `published -> expired` yet.
- The sweep is an optimization and audit transition, not the source of truth. It may persist `expired` only from `published`, and repeated sweeps are idempotent.
- Each Pay Now authorization uses `authorizationValidUntil = min(serverNow + 10 minutes, payableUntil - 1)` and is issued only when that value is at least the current second. The contract accepts through `authorizationValidUntil` but rejects when `block.timestamp >= payableUntil`, making the application and contract boundary agree.
- Settlement insertion never changes `commercial_status`. A valid event is recorded and triggers receipt/email even if current commercial status is `voided` or `expired`; delayed reconciliation after expiry is expected to have an event block time strictly before `payableUntil`.

## 9. Settlement contract

### Short-lived signed authorization

Publication renders and hashes the final PDF, then creates the invoice key and `keccak256(abi.encode(salt, keccak256(canonicalInvoiceJson), keccak256(pdfBytes)))` document commitment but no long-lived payment signature. When Pay Now is pressed, the backend confirms effective commercial status is `published`, `serverNow < payableUntil`, and no settlement exists, then asks the selected attestor to sign an authorization whose validity cannot reach the expiry boundary.

The EIP-712 payload binds:

- random `invoiceKey`
- salted `documentCommitment`
- payee wallet
- exact 18-decimal native-USDC amount
- `authorizationValidUntil`, strictly less than `payableUntil`
- immutable `payableUntil`
- Arc chain ID
- settlement contract address, domain name `Payr`, and domain version `1` through the EIP-712 domain

Privy's documented server request is `POST /v1/wallets/<wallet_id>/rpc` with body `{method: "eth_signTypedData_v4", params: {typed_data: {types, primary_type, domain, message}}}`.[13] The implementation must capture the actual credential-redacted request bytes emitted by the selected SDK version as a checked-in test fixture before defining the policy. The policy's `ethereum_typed_data_message` type map must match that wire shape exactly, including `EIP712Domain` and field order when the client sends it; a mismatch evaluates false.[11]

The live policy must deny every method except `eth_signTypedData_v4` and pin, to the extent supported by the current policy engine:

- exact `PayrPayment` primary type and complete ordered type map,
- domain `name = Payr`, `version = 1`, Arc chain ID, and deployed settlement contract,
- payee equal to the configured sender payout wallet,
- amount greater than zero and at or below the documented demo cap, and
- authorization and payable-expiry fields, including a denial test for an overlong expiry if relational/time constraints are supported.

The backend and contract enforce exact per-invoice payee, amount, `authorizationValidUntil`, and `payableUntil` regardless of Privy policy support. Privy is accepted only if a live matrix proves the real allowed request plus forbidden method, type, domain name/version, chain, contract, payee, amount, and every supported expiry mutation are denied. Record unsupported policy comparisons explicitly; if the minimum domain/type/payee/amount controls or signature compatibility fail, switch to the isolated testnet signer and make no Privy policy or prize claim. This fallback is still a complete Payr MVP.

Changing the sender payout wallet immediately disables the Privy adapter until its policy is updated to the new payee and the allow/deny matrix is rerun. During that interval Payr uses the isolated testnet signer or disables Pay Now; it never leaves a stale broader policy active.

### Payment function

Conceptual interface:

```solidity
payInvoice(
  bytes32 invoiceKey,
  bytes32 documentCommitment,
  address payable payee,
  uint256 amount,
  uint64 authorizationValidUntil,
  uint64 payableUntil,
  bytes signature
) external payable
```

Required checks:

- `msg.value == amount`
- nonzero payee and amount
- `block.timestamp <= authorizationValidUntil`
- `authorizationValidUntil < payableUntil`
- `block.timestamp < payableUntil`
- invoice key not previously paid
- recovered signer equals the immutable Payr attestor address
- valid EIP-712 domain name/version for the current chain and contract

Required effects:

1. Mark `invoiceKey` paid.
2. Forward the complete native-USDC value to `payee`.
3. Revert all state if forwarding fails.
4. Emit `InvoicePaid(invoiceKey, documentCommitment, payer, payee, amount)`.

The contract holds no balance after a successful call and provides no withdrawal path. Reentrancy protection and checks-effects-interactions are mandatory.

Voiding prevents Payr from issuing a new signature. An authorization issued immediately before voiding remains usable until its short expiry, so a valid post-void settlement is possible and must be recorded with `settledAfterVoid`. Onchain immediate revocation is a post-MVP feature and this bounded race must be documented rather than hidden. No authorization can produce a valid settlement at or after `payableUntil` because the contract checks that boundary independently.

Arc's native and ERC-20 USDC interfaces represent the same asset but use different raw decimals. The settlement path uses only the 18-decimal native interface; code must never compare it directly with 6-decimal ERC-20 values.[5]

Arc's deterministic finality means a successful receipt in one committed block is final and irreversible. Contract and reconciler code must not add Ethereum-style confirmation counts, reorg rollback, or settlement reversal state.[12]

## 10. Privacy and security

- Names, addresses, contacts, line items, tax fields, rendered documents, salts, and notes stay offchain.
- Invoice and receipt pages/PDFs use separate revocable HMAC-derived bearer slugs. The database stores reproducible non-secret token metadata and a keyed lookup hash, never the raw slug or URL.
- Slugs and connector credentials are redacted from application logs, application analytics, errors, traces, and audit payloads. Platform/CDN logs and browser history remain possible exposure surfaces and are not covered by a no-log claim.[18]
- Bearer links protect against guessing but not client forwarding; Payr must not claim stronger confidentiality.
- The onchain document commitment is salted to resist guessing low-entropy invoice contents.
- Only the invoice key, salted commitment, payer, payee, amount, and settlement event are public.
- Server rendering escapes all user-controlled text.
- API responses minimize profile data and are scoped by workspace.
- Composite tenant foreign keys and exact invoice-version settlement foreign keys enforce ownership beneath application and RLS checks.
- Privileged database functions live in the exposed `public` schema for server-side RPC, with `PUBLIC`, `anon`, and `authenticated` execution revoked; only `service_role` can invoke the named functions.[16][17]
- Connector, invoice, and receipt credentials are independently expiring, revocable, and rate-limited. Connector creation displays the secret once and writes only a redacted audit event.
- Login and payout changes use purpose-bound, expiring, atomically consumed nonces. The server reconstructs the message; the workspace owner wallet signs payout changes; agent tools cannot perform them.
- The `__Host-payr-session` cookie is always Secure/HttpOnly/host-only as defined in section 6.[15]
- Web-search suggestions require source URLs and explicit field-level confirmation. User-entered fields use `user_provided`; only the server can emit `saved_profile`. Email and wallet addresses are never inferred.
- A leaked connector token could publish or void invoices despite the intended chat approval turn; strict testnet scope, expiry, rate limits, one-time display, revocation, redacted audit logs, and immediate post-demo rotation bound this declared shortcut. OAuth remains required for production.
- If enabled, the Privy attestor wallet is policy-constrained, kept unfunded, and never used to custody or transfer payer/freelancer funds.
- Attestor compromise could authorize deceptive payment terms, so the client page must visibly show payee and amount before wallet approval.
- The signer interface and isolated testnet signer fallback prevent an unproven Privy policy from weakening or blocking the core flow.
- Invoice and receipt emails contain protected financial-document links; Resend/Gmail provider metadata is treated as sensitive operational data.
- The product makes no tax, sanctions, AML, or legal-compliance guarantee.

### Artifact delivery controls

- Invoice HTML/PDF and receipt HTML/PDF each consume the same canonical immutable view model for their artifact kind. Parity tests extract and compare invoice number, parties, line items, dates, amount, asset/network, payee, commitment, settlement proof where applicable, and QR destination.
- `pdfContentHash` is `keccak256` of the exact bytes read back during finalization and served by the protected PDF route. The route streams that immutable object without regeneration or byte transformation and returns `Content-Length` plus `X-Payr-Content-Hash: <pdfContentHash>`.
- The invoice QR is embedded in both invoice page and PDF and decodes exactly to `paymentUrl`; the receipt QR is embedded in both receipt page and PDF and decodes exactly to its receipt page URL. Verification decodes each image from final served HTML and PDF bytes rather than trusting renderer input.
- Protected page/PDF responses set `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Protected HTML uses a per-response nonce and a Content Security Policy equivalent to `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self' <configured Arc RPC origins>; script-src 'self' 'nonce-<nonce>'; style-src 'self' 'nonce-<nonce>'`. PDF responses use `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="<deterministic-filename>.pdf"`.
- The storage bucket is private, listing is disabled, and artifacts have no public object URL. Integration tests prove unsigned direct-storage GET/list denial and prove only the server bearer route returns bytes.

## 11. Money and state invariants

- The frontend cannot credit an invoice or create `Paid`; `Paid` is a display value derived only from a verified settlement row.
- Only a verified Arc event from the configured contract and chain can create a settlement.
- The unique settlement identity is chain ID + transaction hash + log index.
- Each invoice key can settle once.
- A settlement is bound by database constraints to the exact workspace, invoice, frozen version, invoice key, chain, and contract that produced it.
- Exact payment only; partial payment, overpayment, and tips revert.
- Every accepted payment atomically forwards the full amount or reverts.
- The contract rejects settlement at or after `payableUntil`; one committed Arc block is final.[12]
- Settlement insertion does not change commercial status and is allowed after void/expiry reconciliation. Every valid settlement enqueues receipt and email work.
- The receipt references one immutable invoice version and one verified event, and its ready artifact is immutable.
- Receipt generation and each logical Resend delivery are durable and idempotent at Payr's record level and occur only after verified settlement.
- Recipient identity is trim/lowercase normalized for MVP deduplication; a unique `(settlement_id, normalized_recipient)` delivery retains an ordered set of `issuer|client` roles so one person receives one message without losing why they were a recipient.
- Resend provider idempotency lasts only 24 hours.[14] Payr makes no transport-level exactly-once claim: an ambiguous `sending` attempt is retried with the same provider key only within that window, while an unknown outcome older than 24 hours moves to `manual_review` rather than risking an automatic duplicate.
- A payment authorization is not evidence of payment.
- Money is represented as decimal strings and integer atomic units, never floating-point numbers.

## 12. Failure behavior

- Unknown client without complete confirmed new-client fields: include the required client paths in `MISSING_FIELDS`; create nothing and let the host agent ask before retrying.
- Missing/ambiguous data or absent payment-term defaults: return strict structured `MISSING_FIELDS`; create nothing.
- Unknown properties, invalid supplied values, inbound `saved_profile`, unconfirmed/conflicting changes, web-sourced fields without URLs, and any sender/payout property: reject with stable field-specific errors rather than treating them as missing.
- Duplicate mutation with the same idempotency key and request fingerprint: resume or return the original resource references. The same key with different canonical input returns `IDEMPOTENCY_CONFLICT`.
- Duplicate finalized publish: reconstruct the existing invoice/PDF URLs and Gmail package from stored IDs and key versions; persisted idempotency JSON never contains raw URLs.
- Stale draft version: reject publication and return the latest draft.
- Worker crash during publication: retain the active attempt and reserved number; after `leaseUntil`, another worker verifies any create-only objects and resumes the same attempt.
- PDF/QR generation, upload, readback, or hash failure: do not expose a payable link; retain an auditable failed attempt and never reuse its number or overwrite its object keys.
- Finalization mismatch between planned and stored object identity, bytes, size, hash, or QR destination: fail closed before `ready`/`published` and require a new attempt.
- Gmail send rejection/failure: invoice remains published and payable because the exact link package was returned without invoking Gmail; the user can retry or send manually.
- Unsupported Gmail attachment: send the protected PDF link instead; do not fail the invoice workflow.
- Expired/revoked/rate-limited connector: deny before revealing private data and emit only a redacted audit event.
- Expired, consumed, wrong-wallet, wrong-chain, or wrong-purpose auth nonce: deny. Concurrent replay permits exactly one successful consume.
- Voided/effectively expired invoice: do not issue a payment authorization, even when an expiry sweep has not run.
- Privy policy rejection: return a stable authorization-denied error without exposing policy internals. A failed integration spike selects the isolated testnet signer before demo, rather than silently bypassing policy at runtime.
- Wrong chain: request an Arc network switch and do not submit.
- Insufficient wallet balance: show invoice value and estimated gas reserve separately.
- Invalid signature, wrong amount/payee/domain/type, expired authorization, `block.timestamp >= payableUntil`, replay, blocked address, or failed forwarding: transaction reverts and no settlement is created.
- Submitted transaction without a final receipt: show `Transaction submitted`; do not infer payment. Once a successful receipt is in a committed Arc block, show `Payment final; syncing receipt` until reconciliation, without confirmation-count language.[12]
- A callback or claimed transaction hash never changes state without independent receipt and event verification.
- Reconciliation after void/expiry: insert every otherwise-valid event. Derive `settledAfterVoid` from event block time versus `voidedAt`; do not classify delayed processing as post-expiry settlement.
- Receipt worker crash/failure after settlement: keep `displayStatus = Paid`, retain the durable job, and retry with lease expiry and bounded exponential backoff. A terminal render error remains visible as `receipt.state = failed` for operator action.
- Resend crash with unknown provider outcome: retry the same delivery/provider key only while the original attempt is less than 24 hours old; otherwise set `manual_review`. Never claim transport-level exactly-once delivery.[14]

## 13. Verification plan

### Unit and API tests

- Canonical serialization and stable salted commitment.
- Decimal parsing and 18-decimal atomic conversion.
- Strict partial draft input: valid missing input returns exact `MISSING_FIELDS`; unknown/wrong-typed input is rejected; no error path mutates.
- Provenance: only inbound `user_provided|web_source`; source URL required for web data; inbound `saved_profile` and explicit/nested sender, issuer, payout, payee, and prefix properties rejected.
- Draft revision through `create_invoice_draft(draftId, expectedVersion)`, stale compare-and-swap rejection, and no fifth MCP tool.
- Idempotency request fingerprints for every mutation, including same-key/same-input replay, concurrent replay, and same-key/different-input rejection.
- Publication interruption after number reservation, render, upload, and before/after finalization; lease expiry recovery returns one final artifact and never reuses a failed number.
- Partial unique enforcement of one active publication attempt per invoice/version and create-only object collision/hash mismatch failure.
- Finalization denial unless read-back bytes, object identity, byte size, hash, and decoded QR match the attempt; idempotent response reconstruction after a simulated process restart with no raw URL in stored result JSON.
- Commercial transition constraints, exact expiry at `now == payableUntil`, effective expiry before sweep, idempotent sweep, void-and-replace, and settlement-independent lifecycle.
- Event parsing, duplicate-settlement suppression, exact composite invoice-version binding, and valid-event insertion after persisted/effective void or expiry.
- `settledAfterVoid` false before/equal `voidedAt` and true strictly after it; delayed reconciliation after expiry retains the event's earlier block time.
- Exact `get_invoice_status` shape and caller redaction for all commercial/payment combinations, including derived `displayStatus = Paid` without any stored `paid` commercial state.
- Login signature success plus replay, concurrent consume, exact-expiry, wrong wallet, wrong chain/domain, tampered client message, and wrong-purpose denial.
- Payout changes signed by the owner wallet, with old/new address binding; payout-wallet-only and agent attempts denied.
- Exact `__Host-payr-session` attributes, including `Secure` in development configuration.[15]
- Composite tenant foreign keys reject cross-workspace IDs even under server-role writes; immutable version, settlement, and ready-artifact update/delete attempts fail.
- Direct Supabase RPC calls to every privileged function fail for `PUBLIC`, `anon`, and `authenticated`; the server role succeeds only through intended inputs.[16][17]
- Connector one-time secret display, scope, expiry, per-token/IP rate limit, revocation, post-demo rotation path, response minimization, and audit/log redaction.
- Invoice/receipt slug determinism by token ID/purpose/key version, purpose separation, keyed lookup, constant-time rejection, revocation, and old-version key rotation.
- Recipient normalization/deduplication preserves both roles; receipt-document and email-delivery lease, retry, backoff, stale recovery, and terminal failure states.
- Resend retry within 24 hours reuses the provider key; an ambiguous older attempt moves to `manual_review` without sending.[14]

### Foundry contract tests

- Valid exact payment and zero retained balance.
- Wrong signer, domain, payee, amount, and `msg.value`.
- Wrong domain name/version, chain, primary type, and verifying contract.
- `block.timestamp > authorizationValidUntil`, `authorizationValidUntil >= payableUntil`, and exact rejection at `block.timestamp == payableUntil`.
- Replay attempt.
- Forwarding failure.
- Reentrancy attempt.

### Arc testnet integration

- Deploy the real contract.
- Create and publish one real invoice commitment.
- Use the Pay Now endpoint to issue a short-lived authorization.
- Settle with real testnet USDC.
- Verify the emitted event in one committed block is treated as final without confirmation-depth or reorg machinery.[12]
- Verify the exact immutable settlement, derived `Paid` display, unchanged commercial state, receipt, recipient balance change, and explorer transaction.
- Reconcile a prior final event after the invoice is effectively expired and prove it is recorded because its block time is before `payableUntil`.
- Exercise the issued-authorization void race if safely feasible and prove any valid later event is recorded with `settledAfterVoid = true`.

This test is mandatory because standard local EVM simulators cannot reproduce all Arc-native behavior.[5]

### MCP and browser verification

- Exercise MCP initialize, tool discovery, missing-field response, draft, publish, status, and void through the deployed remote endpoint.
- Exercise the connector from Claude, not only a local MCP client.
- Generate invoice and receipt pages/PDFs from the same immutable models; compare every parity field, inspect metadata/text, rasterize, and visually verify layout.
- Hash bytes fetched through the protected route and prove they equal `Content-Length`, `X-Payr-Content-Hash`, and the stored hash.
- Decode QR images from the final served page and PDF bytes and prove they equal the appropriate protected page URL.
- Verify protected response headers and prove unsigned direct private-storage GET/list requests fail.
- Visually inspect invoice, payment, and receipt pages at desktop and mobile widths.
- Exercise wrong network, rejected wallet action, voided invoice, exact expiry boundary, reverted transaction, final-but-delayed reconciliation, and derived Paid receipt.
- Verify one Resend logical delivery reaches each normalized confirmed test recipient and same-address parties produce one message with both roles; do not infer transport-level exactly-once.
- Prove publication remains successful when Gmail is unavailable and inspect the exact `gmailLinkPackage` fields.
- As enhancement evidence only, smoke-test Claude Gmail draft/send with its normal approval gate and treat PDF attachment as optional.[10]
- As enhancement evidence only, capture the actual Privy typed-data wire fixture and live-test the full allow/deny matrix before enabling or claiming Privy.[11][13]
- Run the production checks listed one-to-one in acceptance criteria before any completion claim.

## 14. Three-minute demo

- **0:00–0:15:** Keng states the firsthand pain: scattered client details, manual invoices, cross-border currency friction, and manual receipts.
- **0:15–0:45:** In Claude, request: "Invoice Circle 1,000 USDC for building the frontend website." Show the complete draft, including the visibly applied saved payment terms.
- **0:45–1:05:** Approve publication. Claude returns the immutable number, protected payment link, PDF download, QR code, and Gmail-ready message.
- **1:05–1:25:** If the Gmail smoke test is stable, approve the pre-addressed Gmail send and open it in the client inbox. Otherwise open the returned payment link directly and state that Gmail is an enhancement.
- **1:25–2:05:** Open the link as the client, connect a pre-funded external wallet, and pay on Arc.
- **2:05–2:35:** Show the page transition to verified Paid, then show the receipt PDF and Resend receipt email.
- **2:35–2:50:** Return to Claude and query status, including receipt-email state and explorer proof.
- **2:50–3:00:** Show one architecture diagram: agent orchestration, private document/PDF offchain, the selected attestor interface, and direct Arc USDC settlement. Mention Privy only if its policy gate passed.

### Demo fallback

- Fund and test both wallets before the presentation; do not depend on a faucet.
- Keep one previously settled invoice backed by a real Arc transaction and explorer link.
- Keep the successful invoice PDF, receipt PDF, Gmail message, and Resend delivery evidence for that transaction.
- Keep a short recording of a successful real run.
- If Gmail or search fails, bypass the enhancement and continue from the already created payment link.
- If a payment/provider network fails live, state the failure, then demonstrate reconciliation against the prior real transaction. Label prerecorded material as prerecorded.

## 15. Sponsor strategy

### Primary: Arc — Best DeFi/Onchain Finance Application

Arc asks for meaningful Arc/USDC use and favors conditional, automated, or multi-step settlement.[8] Payr qualifies as payment/fintech infrastructure only if the contract enforces exact invoice-bound terms and replay protection. A plain token transfer is not enough.

### Conditional secondary: Privy — Best B2B Financial Product

Privy requires a wallet, a B2B financial workflow, and a functional control such as a policy or signer.[8] Payr has a candidate integration: a policy-controlled Privy server wallet authorizes the intended short-lived EIP-712 payment shape. Privy's current request and policy documentation shows `eth_signTypedData_v4`, domain conditions, and exact typed-data type-map matching, including `EIP712Domain` when emitted by the client.[11][13]

Target this only if an out-of-schedule live spike after core acceptance proves:

- the credential-redacted actual SDK wire request is captured and matches the policy's ordered type map,
- one allowed Payr authorization is signed,
- forbidden method, type, domain name/version, chain, contract, payee, amount, and supported expiry variants are rejected by policy, and
- the Arc settlement contract accepts the resulting valid signature.

If the minimum controls or signature compatibility fail their timebox, use the isolated testnet signer and withdraw from the Privy prize. The fallback remains valid for core MVP acceptance.

### Conditional tertiary: Bazantic — Agentify a New API

Payr's invoice API could be a new reusable agent service. Eligibility requires a Bazantic x402/MPP Gateway, a service not already available through Bazantic or another sponsor API, a working recipe, and a screen-recorded demonstration.[8]

Give Bazantic at most a one-hour out-of-schedule spike only after every core acceptance criterion passes. Keep it only if the gateway and recipe call the canonical Payr API without duplicating state or destabilizing Claude. Otherwise drop the track.

### Conditional fourth: Arc — Launch on Arc Testnet & Push to Mainnet

The From-Scratch prize accepts USDC commerce flows and agentic payments, but requires a working frontend/backend, architecture diagram, documentation, and mainnet deployment or deployment-readiness by 30 September 2026.[8]

Target this only if the testnet vertical slice is stable by code freeze and Keng explicitly commits post-submission time through 30 September. Do not claim this target is complete merely because a testnet contract exists.

### Do not target: Arc — Agentic Economy

Arc asks for autonomous agents that hold wallets, make payments, manage risk, or settle jobs using Circle Agent Stack.[8] Payr's agent creates invoices; a human client controls settlement. Describe Payr as an agent-native invoicing workflow, not an autonomous transacting agent.

### Ineligible: Arc — Best DeFi or Agentic Application

The combined prize is restricted to Continuity Track participants.[8] Payr is registered From Scratch.

## 16. Engineering budget

| Workstream | Hours |
| --- | ---: |
| Foundation, authentication, tenant-safe database, and profiles | 6 |
| Invoice state/API, MCP adapter, and portable agent skill | 7 |
| Crash-safe publication, HTML/PDF parity, protected links, and QR | 6 |
| Settlement contract, Arc deployment, and signer interface | 8 |
| Payment page, external wallet flow, and reconciliation | 5 |
| Receipt artifact worker, durable outbox, and Resend delivery | 6 |
| Release proof and deployed production checks | 2 |
| Three-minute rehearsal and submission evidence | 2 |
| Protected contingency | 2 |
| **Total** | **44** |

The final six focused hours are reserved, in order, for two hours of release proof/deployed checks, two hours of rehearsal/submission evidence, and two hours of contingency. Contingency is not a feature budget. Claude Gmail connector execution, web search, Gmail PDF attachment, Bazantic, and every other optional sponsor enhancement are outside the committed 44-hour schedule and begin only if the core is accepted early. Autonomous payer work has no allocation.

## 17. Leading risks and scope triggers

| Risk | Signal | Required response |
| --- | --- | --- |
| Claude remote connector authentication takes more than planned | No deployed authenticated draft call within the MCP block | Use the declared scoped testnet connector token; do not build full OAuth |
| URL connector credential appears in request metadata | Raw token found in application telemetry or platform/browser exposure cannot be excluded | Fix application redaction, shorten expiry, rotate immediately, avoid sharing affected telemetry, and keep the no-platform-guarantee disclosure |
| Publication is not recoverable | Crash allocates another active attempt, number, or divergent object | Stop feature work; enforce fingerprint/partial uniqueness/lease recovery and prove finalization from read-back bytes |
| Tenant or privileged-function boundary is porous | Cross-workspace composite FK succeeds or direct anon/authenticated RPC executes | Block deployment until constraints/privileges and direct denial tests pass |
| Wallet auth can be replayed or client controls the message | Concurrent nonce consume succeeds twice or changed purpose verifies | Block deployment; make server reconstruction and atomic purpose-bound consume mandatory |
| Arc-native transfer behavior differs from local tests | First testnet settlement fails or units mismatch | Stop UI polish and fix/test the contract on Arc; never fake settlement |
| Arc finality is implemented like a probabilistic chain | Code waits for confirmations or includes reorg rollback | Remove confirmation-depth machinery; verify one committed block per Arc's deterministic-finality contract.[12] |
| Privy policy cannot constrain or sign the actual Payr wire shape | Captured fixture, allow/deny matrix, or contract verification fails | Use isolated testnet signer, drop the Privy prize, and retain the core flow |
| PDF rendering or parity consumes excessive time | Final served PDF/hash/QR or page parity is unreliable after its block | Simplify to one restrained shared model/template; do not add signatures or customization |
| Reconciliation is flaky | A valid final event does not reliably become one exact version-bound ledger record | Make watcher/idempotency the priority; drop all optional enhancements |
| Expiry/void races lose valid settlement | Event is discarded because current commercial state is voided/expired | Accept every otherwise-valid event, compare block time for `settledAfterVoid`, and keep receipt/email work |
| Gmail cannot attach generated PDF | Attachment smoke test fails | Send protected PDF/payment links; do not block invoice delivery |
| Gmail or web search is unreliable | Enhancement causes demo latency or errors | Remove it from the main run and open the generated payment link directly |
| Receipt worker or email duplicates/fails | Same event creates repeated jobs, same-address duplicates, or no durable delivery | Stop polish and fix job/outbox lease and recipient uniqueness before demo |
| Resend outcome remains unknown beyond 24 hours | `sending` has no provider ID after the provider idempotency window | Move to manual review; never auto-resend or claim transport exactly-once.[14] |
| Protected artifact leaks through storage/CDN | Unsigned direct storage request succeeds or served hash differs | Block release; make bucket private, serve only through bearer routes, and reverify exact bytes/headers |
| `payrlink.xyz` TLS or Resend verification remains incomplete | HTTPS or SPF/DKIM checks fail at integration gate | Use verified Vercel hostname for web demo and do not claim branded Resend delivery |
| Bazantic duplicates the MCP layer | Requires a separate data model, agent UI, or committed-schedule time | Drop Bazantic |
| Sponsor pressure expands personas | Autonomous payer enters the critical path | Reject the feature and preserve the freelancer journey |
| Mainnet launch prize creates post-event obligations | No availability through 30 September | Do not submit for that prize |

## 18. Acceptance criteria

Each core criterion maps one-to-one to one required proof. Passing a related criterion does not waive another.

| ID | Core criterion | Required proof |
| --- | --- | --- |
| AC-01 | The deployed remote MCP endpoint exposes exactly the four specified tools to Claude. | Captured Claude tool-discovery result. |
| AC-02 | Valid partial draft input returns exact `MISSING_FIELDS` without mutation. | API response plus before/after database assertion. |
| AC-03 | Draft input rejects prohibited sender/payout fields and invalid provenance. | Negative API test fixture. |
| AC-04 | `create_invoice_draft(draftId, expectedVersion)` appends a revision and rejects a stale version. | Compare-and-swap API test. |
| AC-05 | Publication accepts only explicit approval of the exact draft version and profile diff. | Negative and positive publication API test. |
| AC-06 | Repeating an idempotency key with identical input returns the same publication resources after process restart. | Restart/retry integration test. |
| AC-07 | Repeating an idempotency key with different input returns `IDEMPOTENCY_CONFLICT` without mutation. | Conflict integration test. |
| AC-08 | Only one active publication attempt exists for an invoice/version under concurrency. | Concurrent database/API test. |
| AC-09 | An expired publication lease resumes the same attempt and reserved number. | Crash-at-each-phase recovery test. |
| AC-10 | A terminal failed publication number is never assigned again. | Sequence audit after forced failure. |
| AC-11 | Publication objects are attempt-specific, create-only, and never overwritten during recovery. | Storage collision integration test. |
| AC-12 | Finalization refuses bytes, size, object identity, hash, or QR destination that differ from the attempt. | Tampered-object finalization test. |
| AC-13 | Invoice and receipt URLs are re-derived from stored token ID/key version, and no raw slug/URL exists in token or idempotency rows. | Restart test plus database inspection. |
| AC-14 | Invoice page/PDF and receipt page/PDF contain their specified parity fields from one immutable model. | Extracted-field parity report. |
| AC-15 | Hashing protected-route PDF bytes reproduces stored `pdfContentHash` and the response hash header. | Served-byte hash test. |
| AC-16 | QR images decoded from served page/PDF bytes equal their protected page URLs. | Automated QR decode test. |
| AC-17 | Protected responses have the specified security headers and unsigned direct-storage GET/list requests fail. | Deployed HTTP/storage probe. |
| AC-18 | At `serverNow == payableUntil`, effective commercial status is `expired` before any sweep and authorization is denied. | Boundary-clock integration test. |
| AC-19 | Login uses the server-reconstructed message and an atomic purpose-bound nonce consume. | Replay/concurrency/expiry/wrong-purpose auth suite. |
| AC-20 | The session cookie is exactly `__Host-payr-session; Secure; HttpOnly; Path=/; SameSite=Lax` with no `Domain`. | Deployed `Set-Cookie` assertion.[15] |
| AC-21 | A payout change verifies a fresh signature from the workspace owner wallet over old/new payout data. | Owner/payout/agent negative matrix. |
| AC-22 | Composite foreign keys reject cross-workspace parent IDs and exact version-binding violations. | Direct database constraint tests. |
| AC-23 | Frozen versions, settlements, and ready artifacts reject update/delete and invalid lifecycle transitions. | Direct database immutability tests. |
| AC-24 | Every privileged `SECURITY DEFINER` function denies direct `PUBLIC`, `anon`, and `authenticated` RPC execution. | Role-by-role Supabase RPC test.[16][17][19] |
| AC-25 | A real external wallet settles exact native USDC through the deployed Arc contract. | Arc transaction, event, balance delta, and explorer link. |
| AC-26 | The contract rejects wrong signer/value/payee/domain, replay, overlong authorization, and settlement at `payableUntil`. | Foundry plus Arc negative tests. |
| AC-27 | One successful receipt in a committed Arc block is final without confirmation-depth or reorg state. | Reconciler trace and state-schema inspection.[12] |
| AC-28 | A verified event inserts a settlement without changing the invoice's commercial status. | Database transition assertion. |
| AC-29 | A valid event discovered after void/expiry is retained and generates receipt work. | Delayed-reconciliation integration test. |
| AC-30 | `settledAfterVoid` is true exactly when settlement block time is strictly later than `voidedAt`. | Before/equal/after timestamp table test. |
| AC-31 | `get_invoice_status` matches the exact section 7 shape and derives `displayStatus = Paid` only from a settlement. | Contract/schema snapshot for every state combination. |
| AC-32 | A settlement creates one recoverable receipt document that produces one immutable receipt page/PDF. | Worker lease/retry/stale-recovery test. |
| AC-33 | Normalized duplicate party emails produce one outbox delivery retaining both roles. | Same-address delivery test. |
| AC-34 | An ambiguous Resend attempt older than 24 hours becomes `manual_review` without an automatic resend. | Clock-controlled outbox test.[14] |
| AC-35 | The exact `gmailLinkPackage` is returned without invoking Gmail, and simulated Gmail failure cannot affect publication. | Response schema plus dependency-failure test. |
| AC-36 | Either the accepted Privy signer or the isolated testnet signer produces the same contract-valid Payr authorization. | Selected-signer contract integration test. |
| AC-37 | Private invoice content is absent from calldata/events except for the salted commitment and required public settlement fields. | Decoded real transaction/event inspection. |
| AC-38 | The repository's complete automated test command exits zero under the release environment. | Saved command and output. |
| AC-39 | The repository's typecheck command exits zero. | Saved command and output. |
| AC-40 | The production build command exits zero with no mock-settlement or auth-bypass flag. | Saved environment manifest and build output. |
| AC-41 | The deployed production-origin smoke run uses HTTPS, configured Arc chain/contract, private storage, real database, and selected real signer implementation. | Release checklist with endpoint/transaction evidence. |
| AC-42 | The core live path from Claude draft through derived Paid receipt fits under three minutes without Gmail, search, or Bazantic. | Uncut timed rehearsal recording. |
| AC-43 | Repository documentation, architecture diagram, live demo, and submission use the same commercial-state/payment model. | Final release review checklist. |

Enhancement acceptance is separate and cannot satisfy any core AC:

- Gmail: Claude creates and sends the initial link-bearing message after its own user approval.[10]
- Gmail attachment: demonstrated only if a live test proves arbitrary PDF attachment; otherwise links remain the supported package.
- Search: the host agent presents sourced public client fields and Payr persists none without explicit confirmation.
- Bazantic: its gateway/recipe calls the canonical Payr API without a second state model or core-schedule work.
- Privy prize evidence: the actual wire fixture and complete supported allow/deny matrix pass; otherwise AC-36 uses the isolated testnet signer and Payr makes no Privy claim.[11][13]

## 19. Decisions requiring no further implementation debate

- Primary user: freelancer, not accounts-payable team.
- Human client controls payment.
- Claude is the demo interface; Payr remains API/MCP-first.
- Saved profiles are authoritative; host-agent memory only selects them.
- Approved host-agent search may suggest sourced public client fields, but Payr accepts only confirmed `user_provided|web_source` values and never infers email/wallet addresses; `saved_profile` is server output only.
- Sender identity and payout wallet are dashboard-only; the agent may save approved client-profile changes.
- The workspace owner wallet, not a payout address by itself, signs every payout change through a server-reconstructed, purpose-bound, atomically consumed challenge.
- Saved default payment terms apply when the prompt omits a due date and are shown in the draft.
- Publication and Gmail send use separate user approvals.
- `create_invoice_draft` also performs compare-and-swap draft revision so MCP remains exactly four tools.
- Publication is fingerprinted, leased, recoverable, create-only at storage, and finalized only from verified stored bytes; published invoices are immutable, sequentially numbered, and corrected through void-and-replace, and failed numbers are never reused.
- Commercial state is only `draft|published|voided|expired`; payment is the existence of a verified settlement, and `Paid` is a derived display status.
- Every valid configured-chain/contract event is recorded and triggers receipt/email even after void or expiry; `settledAfterVoid` compares event block time strictly with `voidedAt`.
- Effective expiry begins exactly at `serverNow >= payableUntil` without waiting for a sweep, and the contract rejects settlement at that boundary.
- PDF and QR are core artifacts; automatic Gmail PDF attachment is not.
- The exact initial link package is core; Claude Gmail send is an enhancement. Resend sends verified post-settlement receipts.
- Invoice and receipt slugs are purpose-separated HMAC derivations from stored non-secret token IDs/key versions; the database stores keyed lookup hashes and never raw slugs/URLs.
- The Claude URL credential is an explicit expiring testnet shortcut with one-time display, scope/rate limits/revocation/redacted audit/post-demo rotation; application telemetry is redacted, but platform/CDN/browser-history exclusion is not guaranteed. OAuth remains the production target.
- Invoice contents stay offchain.
- Arc and USDC are the only settlement chain/asset in MVP.
- One Arc committed block is deterministically final; no confirmation-depth/reorg machinery is implemented.[12]
- Invoices are denominated and settled in exact USDC without a USD oracle or equivalent display.
- Settlement uses a minimal invoice-bound contract and a short-lived Pay Now authorization, not direct wallet transfer, escrow, or NFT issuance.
- The invoice is generic and makes no tax-compliance guarantee.
- Dual-party EIP-712 invoice acknowledgment is excluded; client transaction approval is the settlement act.
- Privy is retained only if its actual typed-data wire shape and supported domain/type/payee/amount/expiry controls pass the live allow/deny matrix; the isolated testnet signer is a valid core fallback.
- Arc autonomous-agent tracks remain excluded.

## 20. Remaining pre-implementation checks

These are verification tasks, not design decisions:

- Confirm the exact ETHOnline submission cutoff time and timezone from the authenticated event dashboard.
- Confirm `payrlink.xyz` HTTPS routing and Resend SPF/DKIM verification after DNS propagation.
- Exercise the required Claude, Circle/Arc, Resend, and wallet accounts; exercise Gmail, Privy, and Bazantic only before claiming their enhancements.
- Verify connector URL application-log/analytics redaction on Vercel, document that platform/CDN/browser-history exposure cannot be excluded, and rehearse immediate token revocation/rotation.[18]
- Verify server-secret/key-version provisioning and rotation can re-derive invoice and receipt URLs after a cold restart without recording raw URLs.
- Verify local/deployed auth, exact `__Host-payr-session` attributes, server-reconstructed messages, and owner-wallet payout signatures.[15]
- Run composite tenant, immutable-row, constrained-transition, and direct `anon`/`authenticated` RPC denial probes against the deployed Supabase database.[16][17]
- Force crashes at every publication and receipt/outbox phase, recover stale leases, and inspect that failed numbers/object keys are never reused or overwritten.
- Verify protected response headers, served-byte hashes, embedded QR decoding, and denial of unsigned direct private-storage reads/listing.
- For the optional Privy claim only, capture the credential-redacted `eth_signTypedData_v4` request from the selected SDK, including `EIP712Domain` when emitted, then prove the supported allow/deny matrix; core already uses the valid fallback signer.[11][13]
- Verify Claude Gmail link sending and separately test outbound PDF attachment only as enhancements.
- Verify Resend provider-key behavior inside 24 hours and Payr's older-ambiguous `manual_review` branch.[14]
- Confirm the Arc testnet RPC, explorer, chain ID, and faucet-funded balances from official current documentation.
- Confirm one committed Arc block is the deployed reconciler's finality threshold and remove any confirmation/reorg configuration.[12]
- Verify whether the selected Arc mainnet-launch prize requires any additional registration outside the ETHGlobal submission.

## Sources

[1] https://ethglobal.com/events — ETHGlobal Events
[2] https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — Claude custom connectors using remote MCP
[3] https://platform.claude.com/docs/en/agents-and-tools/mcp-connector — Claude MCP connector documentation
[5] https://docs.arc.io/arc/references/evm-differences.md — Arc EVM differences
[8] https://ethglobal.com/events/ethonline2026/prizes — ETHOnline 2026 prizes
[10] https://support.claude.com/en/articles/10166901-use-google-workspace-connectors — Claude Google Workspace connector capabilities
[11] https://docs.privy.io/controls/policies/example-policies/ethereum.md — Privy Ethereum policy examples
[12] https://docs.arc.io/arc/concepts/deterministic-finality.md — Arc deterministic finality and settlement
[13] https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data.md — Privy sign typed data (EIP-712)
[14] https://resend.com/docs/dashboard/emails/idempotency-keys — Resend idempotency keys
[15] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie — MDN Set-Cookie header
[16] https://www.postgresql.org/docs/current/sql-createfunction.html — PostgreSQL CREATE FUNCTION
[17] https://supabase.com/docs/guides/database/functions — Supabase database functions and privileges
[18] https://vercel.com/docs/logs/runtime — Vercel runtime logs
[19] https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html — PostgreSQL ALTER DEFAULT PRIVILEGES

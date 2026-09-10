# PayR Demo Use Case and Narration

> Preserved main narrative. Before recording, apply [Current Recording Scope](README.md#current-recording-scope-10-september): mandatory both-approval Publish & Send replaces older separate-send or link-only fallback scenes. Illustrative amounts and emails authorize no live writes.

**Recommended length:** 3 minutes

**Audience:** Hackathon judges, potential users, and grant reviewers
**Main message:** PayR connects an invoice to a real USDC payment and automatically turns verified settlement into paid status and a receipt.

## Primary use case

### User

Keng is an independent software developer who works with international clients.

### Situation

Keng has completed an API milestone for Acme. Acme owes him **250 USDC**, due Friday.

### Current problem

Without PayR, Keng must:

1. Find Acme's billing details.
2. Create and check an invoice manually.
3. Send separate wallet and network instructions.
4. Monitor his wallet for payment.
5. Work out which transfer belongs to which invoice.
6. Update the invoice and create a receipt.

A normal USDC transfer can settle quickly, but it does not automatically explain what was paid, which invoice it belongs to, or whether a receipt should be issued.

### PayR outcome

With PayR, Keng makes one request, approves the completed invoice, and shares one payment link. Acme pays from its own wallet. PayR independently verifies the Arc settlement, marks the correct invoice as paid, and creates the corresponding receipt.

## Three-minute video flow

### 0:00–0:20 — Introduce the problem

**Show**

- Keng's completed project or a simple "Work completed" card.
- A visual list of separate tools: document, email, wallet, spreadsheet, receipt.

**Narration**

> Meet Keng, an independent developer working with international clients. He has completed an API milestone for Acme and needs to collect 250 USDC. Creating the invoice is only the beginning. He still has to send payment instructions, monitor his wallet, identify the transfer, update the invoice, and produce a receipt.

**On-screen text**

> Work completed. Payment operations still unfinished.

---

### 0:20–0:35 — Introduce PayR

**Show**

- PayR logo.
- Simple workflow:
  `Ask → Approve → Pay → Verify → Receipt`

**Narration**

> PayR connects this entire process. It combines AI-assisted invoice creation with invoice-specific USDC settlement and verified reconciliation on Arc.

---

### 0:35–1:05 — Create the invoice

**Show**

- Claude with the deployed PayR connector.
- Enter:

> Invoice Acme 250 USDC for the API milestone, due Friday.

- Show the resulting invoice draft.
- Highlight sender, client, service, due date, and amount.

**Narration**

> Keng asks the PayR agent to invoice a saved client. PayR loads the confirmed business details, validates the amount and due date, and creates a complete draft. The agent does not invent missing legal details or move money.

**Value demonstrated**

- Less repetitive data entry.
- Fewer missing or inconsistent invoice fields.
- One natural-language request creates a reviewable result.

---

### 1:05–1:25 — Review and approve

**Show**

- Keng reviews the draft.
- Show the amount and payout wallet clearly.
- Keng explicitly approves publication.
- Show the generated private payment link.

**Narration**

> PayR does not publish automatically. Keng checks the invoice and explicitly approves it. PayR freezes that version and creates a private payment link with exact settlement terms.

**Value demonstrated**

- The human remains in control.
- Published invoice details cannot silently change afterward.

---

### 1:25–2:05 — Client pays

**Show**

- Open the link in a separate browser profile as Acme.
- Show the invoice and printable PDF.
- Highlight the payee, 250 USDC amount, and Arc network.
- Connect Acme's pre-funded wallet.
- Approve the real testnet transaction.
- Show the Arc explorer transaction.

**Narration**

> Acme opens the link without creating a PayR account. The client reviews the invoice, connects its own wallet, and approves the exact 250 USDC payment. PayR never controls the client's funds. The settlement contract checks the invoice authorization, amount, payee, expiry, and replay status before forwarding the payment directly to Keng.

**Value demonstrated**

- Clear payment instructions in one place.
- Direct USDC settlement to the freelancer.
- Exact invoice-bound terms rather than an unexplained wallet transfer.

---

### 2:05–2:35 — Verify and reconcile

**Show**

- Return to PayR or Claude.
- Request the invoice status.
- Show the transition from `Published` to `Paid`.
- Open the receipt.
- Highlight transaction hash, payer, payee, amount, and settlement time.

**Narration**

> A wallet popup is not enough to mark an invoice paid. PayR independently reads the configured Arc contract event and records the settlement once. The correct invoice becomes Paid, and PayR creates a receipt linked to the immutable invoice and real transaction.

**Value demonstrated**

- No manual wallet monitoring.
- No guessing which transfer paid which invoice.
- Verifiable payment proof and automatic receipt creation.

---

### 2:35–3:00 — Summarize the benefit

**Show**

- Before and after comparison.
- Final PayR logo and product URL.

**Narration**

> Without PayR, invoicing, payment instructions, settlement tracking, reconciliation, and receipts happen across disconnected tools. With PayR, one approved invoice becomes one payable link, one verified USDC settlement, and one linked receipt. In the future, a privacy-conscious history of completed payments could support business reputation and invoice financing. Today, PayR solves the immediate problem: helping independent businesses get invoices paid and reconciled with less manual work.

**Final on-screen line**

> PayR — Private invoices. Verifiable payments.

## Before and after

| Without PayR | With PayR |
| --- | --- |
| Manually assemble every invoice | Create a draft from one request and saved profiles |
| Send separate wallet instructions | Share one invoice-specific payment link |
| Client may use the wrong network or amount | Show exact Arc and USDC settlement terms |
| Monitor wallet transfers manually | Verify the configured contract event |
| Guess which payment belongs to which invoice | Bind settlement to an invoice key |
| Update payment status manually | Reconcile the verified event once |
| Create a separate receipt | Produce a receipt linked to the transaction |

## What must be real in the final recording

- The deployed PayR connector is discovered by Claude.
- The invoice draft comes from the PayR API and saved profiles.
- Publication visibly requires explicit approval.
- The payment page displays the frozen invoice.
- The client uses an external wallet under the client's control.
- The transaction is real Arc testnet settlement, not an animation.
- The explorer transaction and contract event are visible.
- The Paid state comes from verified reconciliation, not a frontend success flag.
- The receipt references the actual transaction.

## Current recording gates

At released `v1.3.0`, reconciled on 9 September 2026:

- A real **1 USDC Arc testnet settlement** has been verified.
- The settlement contract and authorization flow exist.
- R08 receipts/durable delivery and R09 client payments/four-tool MCP are released with green protected CI; R09's release-head tree is deployed.
- One separately approved R08 receipt email is provider-verified as delivered. Human inbox opening and unattended delivery remain unproven; production automatic sending stays disabled.
- Full live Claude connector and external-wallet rehearsals remain open. See `../ops/r09-release.md` and `../ops/mcp-claude-smoke.md`.

Do not record or narrate the final end-to-end flow as complete until those live gates have been exercised. Existing demo payment/send approvals are consumed; preserve their records and obtain fresh approval for any new live transaction or delivery.

## Claims to avoid

Do not say:

- "The AI pays invoices autonomously."
- "PayR guarantees instant payment."
- "PayR already provides loans or invoice financing."
- "All invoice data is public onchain."
- "PayR is legally or tax compliant in every country."

Use instead:

- "The client controls and approves payment."
- "USDC settlement can complete quickly after the client pays."
- "Financing is a potential future layer."
- "Invoice contents remain private; settlement proof is verifiable onchain."
- "PayR creates a generic commercial invoice and payment request."

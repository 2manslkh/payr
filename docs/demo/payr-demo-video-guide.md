# PayR Demo Video Guide

**Target length:** 3 minutes 20 seconds

**Allowed range:** 2–4 minutes

**Primary audience:** Hackathon judges
**Core claim:** One prompt becomes a payable USDC invoice; one verified Arc payment becomes a paid invoice and receipt.

## 1. Story to communicate

PayR helps independent developers and small digital-service businesses create invoices through an AI agent, receive USDC through an invoice-specific payment link, and automatically reconcile the verified onchain payment into a receipt.

The video must prove one causal journey:

`AI request → reviewed invoice → payment link → real USDC payment → verified paid status → receipt`

The demo should not present financing, credit scoring, autonomous payer agents, automated reminders, or multiple payment methods as completed features. Financing may be mentioned briefly as future potential built on verified payment history.

## 2. Timed shot list and narration

### 0:00–0:15 — Hook

**Show**

- PayR logo and product name.
- Quick sequence of an invoice, payment link, and paid receipt.

**Narration**

> Getting paid should not require creating an invoice, sending wallet instructions, monitoring transfers, matching payments, and producing receipts across separate tools. PayR turns that fragmented process into one verified workflow.

**On-screen text**

> From work completed to payment verified.

---

### 0:15–0:35 — Problem

**Show**

- A simple five-step manual workflow graphic:
  `Create invoice → Send instructions → Check wallet → Match transfer → Make receipt`
- Keep it visual; do not use a paragraph of text.

**Narration**

> Independent developers billing international clients still manage invoicing and reconciliation manually. Stablecoins settle quickly, but a raw wallet transfer is not reliably connected to a specific invoice or receipt.

---

### 0:35–0:55 — PayR solution

**Show**

- A simple architecture animation or diagram:
  `Freelancer → PayR agent → Client payment page → Arc → Verified receipt`
- Label invoice contents as private and settlement proof as onchain.

**Narration**

> PayR combines an AI-assisted invoice workflow with invoice-bound USDC settlement on Arc. Full invoice details stay private, while the blockchain provides independently verifiable payment proof.

---

### 0:55–1:30 — Create the invoice through the agent

**Show**

- Claude with the deployed PayR connector.
- Enter the real prompt:

> Invoice Acme 250 USDC for the September API milestone, due Friday.

- Show PayR returning a complete draft populated from saved sender and client profiles.
- Briefly highlight client, work description, amount, due date, and payout wallet.

**Narration**

> I ask PayR to invoice a saved client. PayR loads the private business profiles, validates the commercial terms, and produces a complete draft. The API uses deterministic validation; the language model does not decide payment state or move funds.

---

### 1:30–1:50 — Human approval and publication

**Show**

- Review the invoice draft.
- Explicitly approve publication.
- Show the returned opaque payment link.

**Narration**

> PayR always requires explicit human approval before publication. Once approved, it freezes the invoice version and creates a private payment link with exact settlement terms.

**Proof to keep visible**

- Approved amount: 250 USDC.
- Arc network.
- Payment-link domain.

---

### 1:50–2:30 — Client pays on Arc

**Show**

- Open the payment link in a separate browser profile as the client.
- Display the invoice, payee, amount, due date, and Arc network.
- Connect a pre-funded external wallet.
- Approve the exact 250 USDC transaction.
- Show the wallet confirmation or Arc explorer transaction.

**Narration**

> The client opens the link without creating a PayR account, checks the payment details, and authorizes the transaction from their own wallet. The PayR contract enforces the payee, exact amount, expiry, and single settlement, then forwards the complete payment directly to the freelancer.

**Recording note**

- Waiting for transaction confirmation may be shortened during editing.
- Do not replace the transaction with fabricated output.
- Keep the real transaction hash available for the next scene.

---

### 2:30–3:00 — Reconciliation and receipt

**Show**

- Return to Claude and ask:

> Check the status of the Acme invoice.

- Show `Paid` status.
- Open the receipt and Arc explorer proof.
- Highlight payer, payee, amount, timestamp, and transaction hash.

**Narration**

> PayR does not trust a frontend success message. It independently verifies the configured contract event on Arc and records the settlement once. The invoice then becomes Paid, and PayR produces a receipt linked to the immutable invoice version and real transaction.

---

### 3:00–3:20 — Value and future direction

**Show**

- Final before-and-after graphic.
- End card with PayR logo, repository URL, and live application URL.

**Narration**

> PayR turns invoice creation, stablecoin settlement, reconciliation, and receipts into one auditable workflow. Today, the value is faster and simpler payment operations. In the future, verified payment history could—with appropriate privacy and underwriting controls—support business reputation and invoice financing.

**Final on-screen line**

> PayR — Private invoices. Verifiable payments.

## 3. Recording plan

### Ownership

- **Keng:** operate the product, wallet, Claude connector, and explorer; verify all technical proof.
- **Chanita:** narration, screen-recording coordination, editing, captions, timing, and final submission checks.

### Capture order

Record the scenes separately rather than attempting one perfect continuous take:

1. Clean narration.
2. Claude invoice-draft and approval flow.
3. Client payment-page flow.
4. Real Arc wallet transaction and explorer proof.
5. Paid-status and receipt flow.
6. Logo, problem graphic, architecture diagram, and end card.

Edit them into a continuous causal story. Cuts may remove waiting time, but they must not imply that mocked or prerecorded data is live.

## 4. Visual and audio rules

- Record at **1920×1080**, 16:9.
- Use browser zoom that keeps all critical fields legible.
- Keep the cursor movements deliberate and slow.
- Remove bookmarks, notifications, unrelated tabs, and personal information.
- Never expose API keys, connector tokens, private wallet keys, seed phrases, passwords, or unredacted personal addresses.
- Use large captions; some judges may watch without sound.
- Keep background music quiet or omit it. Narration clarity matters more.
- Use the supplied PayR brand assets consistently.
- Avoid decorative animations longer than one second.
- Show the Arc network name and real explorer proof clearly.

## 5. Required proof before recording

This is a recording/rehearsal checklist, not implementation status. R08/R09 are released as of `v1.3.0`; see `../ops/r09-release.md` for evidence and remaining live limits. Do not describe a live journey as proven until it has been exercised:

- [ ] Deployed Claude custom connector discovers all four Payr tools: `create_invoice_draft`, `publish_invoice`, `get_invoice_status`, and `void_invoice`.
- [ ] The prompt creates a complete draft from saved profiles.
- [ ] Publication requires explicit approval.
- [ ] The hosted payment link shows the frozen invoice.
- [ ] A pre-funded external wallet can pay exact native USDC on Arc.
- [ ] The deployed contract emits the expected settlement event.
- [ ] The configured reconciler—not the frontend—marks the invoice paid.
- [ ] Claude returns paid status, explorer proof, and receipt.
- [ ] Wrong-value and replay contract tests pass.
- [ ] Explain the privacy boundary accurately: billing contents stay offchain, while calldata/events expose settlement terms, addresses, invoice key, and document commitment.
- [ ] Production tests, typecheck, and build pass.
- [ ] The final edited video is between 2:00 and 4:00.

## 6. Demo fallback

Before recording the final video:

- Pre-fund both wallets; do not depend on a faucet during capture.
- Keep one previously settled invoice backed by a real Arc transaction.
- Save the transaction hash and explorer URL separately.
- Capture a clean successful run before experimenting with additional features.
- If a live provider fails, show the failure honestly and demonstrate reconciliation using the prior real transaction.
- Label any prerecorded sequence as prerecorded; never present mocked settlement as real.

## 7. Editing cuts if the video is too long

Cut in this order:

1. Reduce the future-financing section to one sentence.
2. Shorten the architecture explanation.
3. Remove wallet-confirmation waiting time.
4. Shorten draft-field highlighting.

Never cut the explicit approval, real transaction proof, verified Paid state, or receipt. Those moments establish the product’s credibility.

## 8. Final review questions

Before submission, ask:

1. Can a new viewer identify the user and problem within 35 seconds?
2. Is it obvious that the client—not the AI agent—controls payment?
3. Does the video prove a real Arc transaction rather than merely claim one?
4. Is the paid state visibly caused by verified settlement?
5. Are private invoice data and public settlement proof explained accurately?
6. Is financing clearly labeled as future potential?
7. Does every claim match the actual build?
8. Does the final export remain under four minutes?

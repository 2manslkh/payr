# PayR keynote demo script — personal-hook version

> Preserved root donor, 10 September reconciliation. [Current Recording Scope](README.md#current-recording-scope-10-september) supersedes the publication/email and fallback wording below; the narrative text is preserved and is not live evidence.

**Target runtime:** 3 minutes 30 seconds
**Speaker:** Keng
**Tone:** Personal, calm, confident
**Story:** The administrative work after completing a project is too long. PayR turns one request into a reviewed invoice, a safer payment flow, verified settlement, and a receipt.

## 0:00–0:22 | Personal hook

**Screen**

Start with Keng on camera against a clean background. Use no title slide. Cut to the PayR logo only on the final line.

**Dialogue**

> Invoicing is tedious.
>
> As a software developer, billing my clients takes far longer than it should. I finish the work, but then I have to find company details, prepare the invoice, send payment instructions, track the transfer, and create the receipt.
>
> That is why we built PayR.

**Screen transition**

Show the PayR logo with:

> Private invoices. Verifiable payments.

## 0:22–0:50 | Explain the problem

**Screen**

Animate the current process one step at a time:

`Find client details → Build invoice → Send instructions → Check wallet → Match payment → Create receipt`

Show a business address, registration number, contact details, wallet address, and spreadsheet as brief visual examples. Use fictitious data.

**Dialogue**

> The payment is only one part of getting paid. Before it, I collect the client's address, registration details, and contacts. After it, I still need to determine which transfer belongs to which invoice and give both sides a reliable record.
>
> USDC can settle in seconds. The surrounding work can still take much longer.

## 0:50–1:08 | Introduce the solution

**Screen**

Transform the long workflow into:

`Ask → Review → Pay → Verify → Receipt`

**Dialogue**

> PayR connects those steps. One request creates a complete invoice from confirmed business profiles. One approved invoice becomes a payment link. One verified Arc transaction becomes paid status and a receipt.

## 1:08–1:32 | PayR works through the agent

**Screen**

Show the PayR MCP connection, then Claude as the live demonstrated client.

If other clients have been exercised before recording, show their logos under:

> Verified MCP clients

If they have not been exercised, do not show their logos as working integrations. Use this neutral visual instead:

> Built for MCP-compatible AI agents

**Dialogue**

> PayR is not another chat window. It is a tool for the AI agent you already use. PayR connects through MCP, an open protocol for AI tools.
>
> Today, I am demonstrating the deployed connector in Claude. The same PayR interface is designed for other MCP-compatible agents.

## 1:32–1:58 | Ask for the invoice

**Screen**

In Claude, enter:

> Invoice Acme 1 testnet USDC for the September API milestone, due Friday.

Show the tool call and completed draft. Highlight the sender, client, address, registration details, service, due date, payout wallet, and amount.

**Dialogue**

> I tell my agent who I want to invoice, what the work was, how much the client should pay, and when it is due. We are using one testnet USDC for this demonstration.
>
> PayR loads the sender and client details I previously confirmed, validates the required fields, and prepares the draft.

## 1:58–2:18 | Review and approve

**Screen**

Hold on the draft. Show the amount and payout wallet clearly. Approve publication, then reveal the private payment link and invoice PDF.

**Dialogue**

> The agent does not publish the invoice on its own. I review the terms first. When I approve, PayR freezes that invoice and creates a private payment link.

## 2:18–2:35 | Deliver the invoice

### Use this version only after email delivery is verified

**Screen**

Show the sent invoice email in both the freelancer and client inboxes. Redact private addresses. Open the client copy and reveal the payment link.

**Dialogue**

> PayR sends the finalized invoice and payment link to the client and a copy to me. The client no longer has to copy a wallet address, amount, or network from a separate message.

### Safe fallback if email delivery is not verified

**Screen**

Show the generated link and use PayR's explicit share or copy action. Do not show a fake inbox.

**Dialogue**

> PayR gives me the finalized invoice and one private payment link to share with the client. The link carries the invoice, recipient, exact amount, and network together.

## 2:35–2:58 | Client payment

**Screen**

Switch to a separate client browser profile. Open the link, connect the pre-funded external wallet, and approve the real Arc testnet payment. Show the transaction in the Arc explorer.

**Dialogue**

> The client opens the link, reviews the invoice, and pays from their own wallet. PayR never controls the client's funds.
>
> The settlement contract checks the signed terms and rejects the wrong amount, an expired request, or a second payment.

## 2:58–3:30 | Confirmation, receipt, and close

**Screen**

Return to PayR or Claude. Show `Published` changing to `Paid`. Open the receipt beside the matching Arc transaction. End on the PayR logo.

**Dialogue**

> PayR does not trust a browser saying "success." It verifies the settlement event on Arc and records it once.
>
> The invoice is now Paid. PayR sends or presents the confirmation receipt with the same payer, payee, amount, time, and transaction hash.
>
> I spend less time administering the payment. My client gets clearer instructions. And both of us receive proof tied to the same invoice.
>
> PayR. Private invoices. Verifiable payments.

## Claim and recording gates

Before recording the final video:

- Demonstrate only agent clients that have completed a real PayR tool call. Do not imply that Claude Desktop, Codex, Hermes, or OpenClaw are supported merely by displaying their logos.
- Describe PayR as designed for MCP-compatible agents unless each named client has been tested.
- Show automatic invoice email only after the configured provider has delivered it to both real inboxes.
- Show a confirmation receipt email only after durable receipt delivery has been exercised.
- If email is not ready, use the provided link-sharing fallback and show the receipt in PayR.
- Use confirmed PayR sender and client profiles. Do not claim PayR scrapes or invents registration details.
- Use a fresh invoice and a funded testnet wallet. Never pay the preserved evidence invoice again.
- Keep the real Arc explorer transaction visible.
- Do not claim that PayR guarantees earlier payment, provides financing, or supports autonomous payer agents.

## Why this structure works

- The first line identifies the pain immediately.
- Keng's firsthand experience makes the problem credible.
- The PayR logo appears only after the audience understands why the product exists.
- The explanation moves from pain to simplification, then proves each step live.
- The final scene returns to the human benefit instead of ending on architecture.

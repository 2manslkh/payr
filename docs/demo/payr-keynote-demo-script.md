# PayR keynote demo script

> Preserved main narrative. Before recording, apply [Current Recording Scope](README.md#current-recording-scope-10-september): mandatory both-approval Publish & Send replaces older separate-send or link-only fallback scenes. This script is not live acceptance evidence.

**Target runtime:** 3 minutes 20 seconds

**Format:** Screen-led product keynote

**Speaker:** One presenter throughout
**Core proof:** A real Arc testnet payment changes a published invoice into a verified paid receipt.

## Delivery direction

Speak calmly and slightly slower than normal conversation. Do not sound like an advertisement. Pause when the screen changes so viewers can absorb the proof. The product should carry the presentation.

Use **1 testnet USDC** for the recorded transaction unless the team has separately verified and approved a different funded amount. State that it is a demo amount. Never reuse the already-settled invoice.

## 0:00–0:20 | Cold open

**Screen**

Start on the final PayR receipt. Keep `PAID`, `1 USDC`, and the transaction hash visible. After two seconds, cut back to the PayR logo.

**Dialogue**

> Payment received.
>
> For a freelancer, those two words should end the job. Instead, they often begin more work: checking a wallet, updating an invoice, and creating a receipt.
>
> This receipt took one request and one verified payment. Here is how.

## 0:20–0:42 | The problem

**Screen**

Show a restrained workflow graphic:

`Invoice document → payment instructions → wallet → spreadsheet → receipt`

**Dialogue**

> Keng is an independent developer. He has finished an API milestone for Acme and needs to get paid.
>
> USDC can cross borders quickly. But a wallet transfer does not say which invoice it paid or when to issue a receipt. Keng still connects those facts by hand.

## 0:42–1:12 | One request creates the draft

**Screen**

Open Claude with the deployed PayR connector. Type:

> Invoice Acme 1 testnet USDC for the September API milestone, due Friday.

Show the returned draft. Move slowly across the saved sender, Acme, service description, due date, payout wallet, and amount.

**Dialogue**

> Keng asks PayR to invoice a saved client. We are using one testnet USDC for this demonstration.
>
> PayR loads the confirmed business profiles, checks the required fields, and builds the draft. The agent handles the conversation; PayR's API validates the invoice.

## 1:12–1:34 | The human stays in control

**Screen**

Hold on the complete draft. Show the explicit approval action, then publish. Reveal the private payment link.

**Dialogue**

> Nothing has been sent yet. PayR stops here for a human decision.
>
> Keng checks the terms. Only after he approves does PayR freeze the invoice and create its payment link.

## 1:34–2:12 | The client pays

**Screen**

Switch to a separate client browser profile. Open the link. Show the invoice and PDF, then the Arc network, exact amount, and payee. Connect the pre-funded client wallet and approve the transaction. Cut only the confirmation wait. Show the resulting Arc explorer transaction.

**Dialogue**

> Now we are Acme.
>
> The client opens one link and sees the invoice, recipient, amount, and network. No PayR account is required.
>
> Acme connects its own wallet and approves the payment. PayR never controls the funds.
>
> On Arc, the contract checks the signed terms, rejects the wrong amount or a replay, and sends the full value directly to Keng.

## 2:12–2:48 | Proof becomes product state

**Screen**

Return to PayR or Claude. Show the invoice as `Published`, then request or refresh its status. Let the `Paid` state appear. Open the receipt beside the Arc explorer event. Highlight the matching amount, payer, payee, timestamp, and transaction hash.

**Dialogue**

> This is the part that matters.
>
> A wallet popup saying "success" does not mark the invoice paid. PayR reads the settlement event from its Arc contract and records it once.
>
> Watch the status: Published. Now, Paid.
>
> The receipt matches the amount, parties, time, and transaction hash. This transfer now belongs to this invoice.

## 2:48–3:20 | Close on the value

**Screen**

Show a before-and-after transition:

`Manual invoice + wallet checking + reconciliation`

becomes

`Request → approve → pay → verify → receipt`

End on the PayR logo, product URL, repository URL, and the line `Private invoices. Verifiable payments.`

**Dialogue**

> Payment speed was only half the problem. The missing piece was the connection between the invoice, the money, and the proof.
>
> PayR connects invoice creation, USDC settlement, verification, and the receipt. Invoice contents stay private. The payment proof stays verifiable.
>
> That history may support reputation or financing later. Today, PayR makes every completed payment clear and attributable.
>
> PayR. Private invoices. Verifiable payments.

## Presentation rules

- Open with the finished receipt, not a title slide or team introduction.
- Keep the presenter off camera during the product flow unless a small picture-in-picture adds warmth without obscuring the UI.
- Never read field labels that the viewer can already see. Explain why each moment matters.
- Pause after `Published. Now, Paid.` Let the state change land.
- Keep the future-financing idea under ten seconds.
- Do not say PayR guarantees early or instant payment. It settles and reconciles quickly after the client chooses to pay.
- Show the Arc explorer and matching receipt in the same scene.
- Hide secrets, private keys, connector tokens, personal data, notifications, and unrelated browser tabs.
- Captions must match the spoken words exactly.
- Cut network waiting time, but never fabricate the transaction, event, status change, or receipt.

## Final recording gate

Record this script only after the following path has been exercised on the deployed system:

`Claude draft → approval → publication → fresh Arc payment → verified reconciliation → receipt`

If Claude MCP or receipt delivery is not ready, shorten the demonstration honestly around the working browser flow. Do not narrate an unfinished integration as live.

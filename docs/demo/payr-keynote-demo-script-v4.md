# PayR keynote demo script v4 — agent-first narrative draft

> Preserved root donor, 10 September reconciliation. [Current Recording Scope](README.md#current-recording-scope-10-september) supersedes separate connected-email-tool approval, no-attachment/no-issuer-copy and link-only fallback wording below. Retain this draft as narrative history, not the current sending contract or live evidence.

**Target runtime:** 3 minutes 30 seconds
**Speaker:** Keng
**Style:** Personal keynote followed by a live product story
**Core line:** PayR lets your existing AI agent handle invoicing and payments.
**Technical qualifier:** Connect a compatible agent through PayR's MCP tools.
**Demo starts:** 0:45

## 0:00–0:18 | Hook

**Screen**

Keng speaks directly to camera. Keep the background clean. Do not show a title slide yet.

**Dialogue**

> The client work is finished. Now I have to find the billing details, write the invoice, and check whether I've been paid.
>
> Why can't I ask my AI agent to handle that, too?

**Screen**

Cut to the PayR logo as the question lands. Keep the same headline here and on the final card.

> Your AI agent. Invoicing and payments.

## 0:18–0:45 | The PayR idea

**Screen**

Briefly show the work around the payment:

`Find details → Create invoice → Send instructions → Check payment → Create receipt`

Collapse it into:

`Ask → Review → Pay → Receipt`

Show the demonstrated agent connected to PayR, with a small caption: `Connected through MCP`. Keep this in the same scene, not a separate compatibility segment.

**Dialogue**

> That's why we built PayR. It lets your existing AI agent handle invoicing and payments.
>
> Connect a compatible agent through MCP, and stay in the conversation you already use.
>
> I describe the job. My agent prepares the invoice through PayR. I review it, my client pays, and PayR verifies the payment.

## 0:45–1:20 | Create the invoice

**Screen**

Open the demonstrated AI agent and type:

> Invoice Demo Client 1 testnet USDC for the September API milestone, due Friday.

Show the agent calling PayR and returning the completed draft. Use a prepared fictional client profile, visibly labeled as demo data. Hold long enough to read the result.

**Dialogue**

> Here's a finished API milestone. I'll ask my agent to invoice the client for one testnet USDC, due Friday.
>
> I've already saved the demo client's billing details, so I don't have to type them again. If something is missing, the agent asks me.
>
> PayR checks the required fields. Here's the draft, ready for me to review.

**Screen details to highlight**

- Sender and client
- Company address and registration details
- Service description
- Due date
- Payout wallet
- Exact USDC amount

## 1:20–1:45 | Human approval

**Screen**

Hold on the draft. Show Keng reviewing the terms and explicitly approving publication of this version. Make the resolved calendar due date visible, not just "Friday."

**Dialogue**

> Before this goes to my client, I check the company details, amount, due date, and payout wallet.
>
> This is the version I want to send, so I approve it. PayR finalizes the invoice and creates a payment link.
>
> Preparing the invoice doesn't mean publishing it. I make that decision.

## 1:45–2:10 | Invoice delivery

**Screen**

Show the prepared email, then Keng separately approving the agent's connected email tool to send it. Switch to the client inbox and open the real delivered message. Show the invoice and payment links; open the PDF link rather than implying an attachment.

**Dialogue**

> PayR prepares the email with the invoice and payment links. I approve the send, and my agent uses its connected email tool to deliver it.
>
> Now I'm switching to the client. Here's the actual email: what I'm paying for, how much, and where to pay.

## 2:10–2:45 | Client payment

**Screen**

Open the payment link in the client browser. Connect the pre-funded wallet, review the amount and network, and approve the real Arc testnet transaction. Cut the confirmation wait, then show the Arc explorer transaction. Leave room for the wallet interaction rather than filling every second with narration.

**Dialogue**

> My client doesn't need an AI agent. They open the link, review the invoice, and approve payment from their own wallet.
>
> This is a real transaction on Arc testnet. The settlement contract checks the authorized payment details and forwards the USDC to my payout wallet in the same transaction.
>
> A wrong amount or a second payment against this invoice is rejected.

## 2:45–3:10 | Verified payment and receipt

**Screen**

Return to PayR. Show the invoice changing from `Published` to `Paid`. Open the receipt and place its transaction reference beside the matching Arc explorer transaction. Use the delivered receipt email only if receipt delivery is enabled and verified for this recording; otherwise show the receipt in PayR.

**Dialogue**

> Back in PayR, the payment is verified and the invoice is marked Paid.
>
> Here's the receipt, with the payment details and the transaction reference. It matches the transaction we just saw on Arc.
>
> I don't have to guess which invoice that wallet transfer belongs to. The payment and the paperwork are connected.

## 3:10–3:30 | Close

**Screen**

Return to the original agent conversation, then show the paid invoice and receipt together. End on the final PayR card.

**Dialogue**

> I started with a request to my AI agent. My client got a clear way to pay. Now there's a receipt tied to that payment.
>
> The work is complete. The payment is proven. The paperwork is done.
>
> That is PayR.

## Recording notes

- Use the agent client that produces the cleanest verified demo. Configure its MCP connector before recording; do not imply zero setup or universal tool-calling compatibility.
- Show only the demonstrated agent's logo unless additional integrations have been tested. If Codex is shown, label it "Codex," not "Claude Codex."
- Rehearse the narration against the scene timings. The live demo begins at 0:45; preserve pauses for draft review, wallet approval, and transaction proof rather than adding more feature narration.
- Make every business detail fictional or explicitly approved for display.
- The opening describes the billing workflow without inventing a specific past incident. Keng should confirm it reflects his experience before recording.
- Prepare the saved demo client and sender details used in the narration. The agent may propose details from memory or public search, but the video must show Keng confirming them before publication.
- Publication prepares links and an email package; it does not send the invoice. Verify the agent's email tool before recording and show separate send approval. If unavailable, show Keng sending the prepared email manually and say: "PayR prepares the email with the invoice and payment links. I review it and send it to my client."
- Do not promise an automatic freelancer copy or a PDF attachment. The prepared email targets the client and links to the PDF.
- Record real invoice and receipt emails after delivery is complete. Do not build fake inbox footage. Automatic receipt delivery must be enabled and verified before showing it; do not claim delivery to two inboxes based on a same-address test.
- Payment links grant access to whoever holds them. Hide full bearer URLs and QR codes in public footage. Do not describe the link as recipient-only or imply that onchain payment facts are private.
- Use a fresh invoice and a pre-funded wallet. Do not repay the preserved evidence invoice.
- Show the Arc transaction or event clearly enough for judges to verify it.
- Cut transaction waiting time during editing, but keep the actual transaction hash and resulting Paid state.
- Keep financing out of the main demo. If needed, mention it after the product proof as a future use of verified payment history.
- Describe the receipt as a payment record, not proof that external accounting systems have reconciled automatically.

## Final on-screen card

> PayR
>
> Your AI agent. Invoicing and payments.

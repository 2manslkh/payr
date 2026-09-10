# Email Templates

## Current Scope: 10 September

The original template-only observations below are retained, including their
then-unconnected receipt builder and no-transport statement. R08 subsequently
connected verified receipts to the durable outbox. The selected Publish & Send
candidate adds client, issuer-copy and combined-role initial invoice variants,
with frozen PDF attachment/private links only after both literal approvals.
The Gmail package remains link-only compatibility data, not an instruction to
send separately. Email-disabled blocks fresh publication, and receipt email
remains independently gated. See `publish-and-send.md` and
`r08-receipts-delivery.md` for their distinct contracts and dated evidence.
Preview rendering never proves provider acceptance or inbox delivery; no new
tests, transport activation or live sends are claimed by docs reconciliation.

## Preview

Run `pnpm dev` and open `/dev/emails`. The gallery is available only when
`NODE_ENV=development`; production returns 404. It uses synthetic `.example`
destinations, with no database or provider access.

Choose invoice, client receipt, issuer receipt, or a receipt for an address
holding both roles. Long-content fixtures exercise business names and exact
large decimal amounts. Controls switch between desktop/mobile widths,
rendered HTML, plain text, and HTML source. Widths shrink to fit smaller screens.

The sandboxed iframe renders the builder's exact HTML, isolated from application
CSS. Links open new contexts in real emails but are blocked by the preview
sandbox. The shared logo image can still make an image request; this is not an
offline preview. No sending or recipient deduplication occurs here.

## Integration

`src/lib/email/templates.ts` exports pure `buildInvoiceEmail` and
`buildReceiptEmail` functions. Both return `subject`, `previewText`, `textBody`,
and `htmlBody`. The HTML includes the hidden inbox preview text, inline styles,
table-based layout and system fonts. The header uses a hosted PNG derived from
`assets/brand/source/logo-v2.png`, following live "Pay" text so the mark forms
the final R. The image has an "r" text alternative for blocked images. The image
URL uses the document URL's origin by default. Callers may supply an explicit
logo origin as the second builder argument; the development gallery supplies
`NEXT_PUBLIC_APP_URL`, falling back to `http://localhost:3000`. Unsafe origins
produce a text-only wordmark. No configuration is read during template import
or rendering. Before delivery, use a public HTTPS origin and deploy
`/brand/payr-mark-v2.png`. Local preview image URLs are not suitable for real
inboxes. Template builders do not fetch the image themselves.
The R is displayed at 28 by 28 pixels, with both HTML dimensions and inline CSS
size limits so a client dropping the dimension attributes does not expand it.

`buildGmailPackage` uses the invoice builder while preserving its six-field
contract and confirmed client recipient. It requires a confirmed sender name.
It does not authorize or perform a send.

The receipt builder is not connected to settlement or the email outbox yet.
Its future caller must supply verified settlement facts, an available receipt
URL, and an audience (`client`, `issuer`, or `both`). It does not verify chain
evidence, create a receipt, resolve recipients, or establish delivery status.
Settlement timestamps require an explicit timezone and display in UTC.
Amounts remain strings to preserve decimal precision. The billed client is
not identified as the paying wallet owner.

Dynamic HTML values are escaped. Only absolute HTTPS destinations without
credentials or whitespace become links; invalid destinations remain literal
text. Bearer URLs are not normalized. Free-form invoice memos are excluded.

## Verification

Run `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
Tests cover audiences, precision, escaping, unsafe destinations, the invoice
package contract, preview controls, and non-development access restrictions.
Browser previews are not email-client emulation. Test real Gmail and Outlook
inboxes, including dark mode, before enabling delivery. No mail transport or
attachments are included in this implementation.

## Delivery Checks

Resend domain verification does not establish inbox placement. For mail from
`receipts@noreply.payrlink.xyz`, check Gmail's Show original summary for SPF,
DKIM, and DMARC results. Verify the actual TXT policy at
`_dmarc.noreply.payrlink.xyz`; these template changes do not prove DNS state.
An initial monitoring policy such as `v=DMARC1; p=none; adkim=r; aspf=r`
starts without requesting rejection or quarantine of legitimate mail;
tighten it only after checking authentication alignment for all intended senders.
Confirm reporting-mailbox configuration separately.

For inbox previews, disable synthetic `.example` payment/PDF links and make
clear that the sample is not a payment request. If the logo is not deployed,
use a small inline image rather than a full-size attachment. These measures
do not guarantee inbox placement: verify the new message's authentication,
and use Not spam on an expected message that Gmail incorrectly classifies.

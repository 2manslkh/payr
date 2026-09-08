import { payrEmailLogo } from "./logo";
import { z } from "zod";

export type EmailContent = {
  subject: string;
  previewText: string;
  textBody: string;
  htmlBody: string;
};

export type InvoiceEmailInput = {
  invoiceNumber: string;
  businessName: string;
  amountDecimal: string;
  dueDate: string;
  invoiceUrl: string;
  invoicePdfUrl: string;
};

export type ReceiptEmailInput = {
  audience: "client" | "issuer" | "both";
  invoiceNumber: string;
  businessName: string;
  clientBusinessName: string;
  amountDecimal: string;
  settledAt: string;
  transactionHash: string;
  receiptUrl: string;
};

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => escapes[character]);
}

function renderEmail(input: {
  subject: string; previewText: string; heading: string; introduction: string;
  amountDecimal: string; amountLabel: string; settled: boolean;
  rows: [string, string][]; action: [string, string]; secondary?: [string, string];
  logoOrigin?: string;
  network?: "Arc" | "Arc Testnet";
}): EmailContent {
  const { subject, previewText, heading, introduction, amountDecimal, amountLabel, settled, rows, action, secondary } = input;
  const network = input.network ?? "Arc";
  // Invalid destinations remain literal text, never executable links. Do not normalize bearer URLs.
  const link = ([label, url]: [string, string], primary = false) => {
    let safe = false;
    try {
      const parsed = new URL(url);
      safe = /^https:\/\//i.test(url) && !/[\s\u0000-\u001f\u007f]/.test(url) && parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch { /* Render malformed destinations as text. */ }
    if (!safe) return `<span style="overflow-wrap:anywhere;word-break:break-word">${escapeHtml(label)}: ${escapeHtml(url)}</span>`;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="${primary ? "display:inline-block;background:#071B3B;color:#FFFFFF;padding:16px 24px;border-radius:8px;font-weight:600;text-decoration:none" : "color:#071B3B;text-decoration:underline"}">${escapeHtml(label)}</a>`;
  };
  const footer = "Keep this email private. Its document links may grant access to invoice or receipt details.";
  const textBody = ["Payr", subject, introduction, `${amountLabel}: ${amountDecimal} USDC on ${network}`,
    ...rows.map(([label, value]) => `${label}: ${value}`), `${action[0]}: ${action[1]}`,
    ...(secondary ? [`${secondary[0]}: ${secondary[1]}`] : []), footer].join("\n");
  const htmlBody = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F5F6;color:#17283E;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F6"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;table-layout:fixed"><tr><td style="padding:12px 24px;border-bottom:1px solid #DDE2E6;color:#071B3B;font-size:28px;font-weight:700">
${payrEmailLogo(input.logoOrigin ?? action[1])}
</td></tr>
<tr><td style="padding:32px 24px 24px;overflow-wrap:anywhere;word-break:break-word">
<h1 style="margin:0 0 16px;color:${settled ? "#0F6B4F" : "#071B3B"};font-size:28px;line-height:1.2;font-weight:600">${escapeHtml(heading)}</h1>
<p style="margin:0 0 28px">${escapeHtml(introduction)}</p>
<p style="margin:0 0 4px;color:#606A76;font-size:14px">${escapeHtml(amountLabel)}</p>
<p style="margin:0 0 4px;color:#071B3B;font-size:32px;line-height:1.25;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(amountDecimal)} USDC</p>
<p style="margin:0 0 28px;color:#606A76;font-size:14px">${settled ? `Settlement verified on ${network}` : `Pay with USDC on ${network}`}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;font-size:14px">
${rows.map(([label, value]) => `<tr><th scope="row" align="left" valign="top" width="35%" style="padding:12px 8px 12px 0;border-top:1px solid #DDE2E6;color:#606A76;font-weight:400">${escapeHtml(label)}</th><td align="right" style="padding:12px 0;border-top:1px solid #DDE2E6;overflow-wrap:anywhere;word-break:break-word;${label === "Transaction" ? "font-family:Consolas,monospace;" : ""}">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
<p style="margin:28px 0 20px">${link(action, true)}</p>
${secondary ? `<p style="margin:0 0 8px;font-size:14px">${link(secondary)}</p>` : ""}
</td></tr><tr><td style="padding:24px;border-top:1px solid #DDE2E6;color:#606A76;font-size:12px">${escapeHtml(footer)}</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject, previewText, textBody, htmlBody };
}

export function buildInvoiceEmail(input: InvoiceEmailInput, logoOrigin?: string): EmailContent {
  return renderEmail({
    logoOrigin,
    subject: `Invoice ${input.invoiceNumber} from ${input.businessName}`,
    previewText: `${input.amountDecimal} USDC due ${input.dueDate}. View your invoice and payment details.`,
    heading: `Invoice from ${input.businessName}`,
    introduction: "Your invoice is ready to review. Open the invoice to check the details and make a payment.",
    amountDecimal: input.amountDecimal, amountLabel: "Amount due", settled: false,
    rows: [["Invoice", input.invoiceNumber], ["From", input.businessName], ["Due", input.dueDate]],
    action: ["View and Pay Invoice", input.invoiceUrl], secondary: ["Invoice PDF", input.invoicePdfUrl],
  });
}

// Call only with verified settlement facts and an available receipt link; this builder does not verify or send.
export function buildReceiptEmail(input: ReceiptEmailInput, logoOrigin?: string): EmailContent {
  const issuer = input.audience === "issuer";
  const heading = issuer ? "Payment Received" : "Payment Confirmed";
  const date = new Date(input.settledAt);
  if (!Number.isFinite(date.getTime()) || !z.iso.datetime({ offset: true }).safeParse(input.settledAt).success) {
    throw new Error("Settlement time must include a valid timezone");
  }
  const settledAt = date.toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
  return renderEmail({
    logoOrigin,
    network: "Arc Testnet",
    subject: `${heading}: ${input.invoiceNumber}`,
    previewText: `${input.amountDecimal} USDC settled on Arc Testnet for invoice ${input.invoiceNumber}.`,
    heading,
    introduction: issuer ? "Payment for your invoice has been verified on Arc Testnet. Your receipt records the settlement details."
      : "Payment for this invoice has been verified on Arc Testnet. Keep the receipt for your records.",
    amountDecimal: input.amountDecimal, amountLabel: issuer ? "Amount received" : input.audience === "both" ? "Amount settled" : "Amount paid", settled: true,
    rows: [["Invoice", input.invoiceNumber], ["Issuer", input.businessName], ["Billed to", input.clientBusinessName], ["Settled at", settledAt], ["Transaction", input.transactionHash]],
    action: ["View Receipt", input.receiptUrl],
  });
}

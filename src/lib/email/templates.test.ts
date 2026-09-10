import { describe, expect, it, vi } from "vitest";
import { buildInvoiceEmail, buildReceiptEmail, type EmailContent, type InvoiceEmailInput } from "./templates";
import { buildGmailPackage } from "../invoices/gmail-package";
import { testPublicationSnapshot } from "../invoices/publication.test-support";

const invoice = {
  invoiceNumber: "INV-42", businessName: "North & South", amountDecimal: "12345678901234567890.123456789012345678",
  dueDate: "2026-09-30", invoiceUrl: "https://payr.example/invoice/demo?a=1&b=2", invoicePdfUrl: "https://payr.example/invoice/demo/pdf",
};
const receipt = {
  ...invoice, audience: "client" as const, clientBusinessName: "Client Studio", settledAt: "2026-09-06T16:32:08+02:00",
  transactionHash: `0x${"ab".repeat(32)}`, receiptUrl: "https://payr.example/receipt/demo",
};
const audiences = ["client", "issuer", "both"] as const;

describe.each(audiences)("invoice audience: %s", (audience) => {
  it.each(["\n", "\r", "\r\n", "\n\r\n"])("derives a single-line subject from a business name containing %j without rewriting body facts", (lineBreak) => {
    const input = { ...invoice, audience, businessName: `Acme${lineBreak}Studio` };
    const email = buildInvoiceEmail(input);
    expect(email.subject).toBe(audience === "issuer" ? "Invoice Issued: INV-42 / Your copy" : "Invoice INV-42 from Acme Studio");
    expect(email.textBody).toContain(`From: Acme${lineBreak}Studio`);
    expect(email.htmlBody).toContain(`Acme${lineBreak}Studio`);
    expect(input.businessName).toBe(`Acme${lineBreak}Studio`);
  });

  it.each(["Arc", "Arc Testnet"] as const)("preserves exact facts and protected URLs on %s", (network) => {
    const input = { ...invoice, audience, network, clientBusinessName: "Client Studio", attachmentIncluded: true,
      invoiceUrl: "https://payr.example/invoice/a%2Fb?token=A%2Bz%3D&v=01#details",
      invoicePdfUrl: "https://payr.example/invoice/a%2Fb/pdf?token=B%2Fz%3D&v=02" };
    const email = buildInvoiceEmail(input);
    const container = document.createElement("div");
    container.innerHTML = email.htmlBody;
    const action = audience === "issuer" ? "View Invoice" : "View and Pay Invoice";
    expect(Array.from(container.querySelectorAll("a"), (link) => [link.textContent, link.getAttribute("href")]))
      .toEqual([[action, input.invoiceUrl], ["Invoice PDF", input.invoicePdfUrl]]);
    for (const body of [email.textBody, container.textContent!]) {
      for (const value of [input.invoiceNumber, input.businessName, input.clientBusinessName, input.amountDecimal, input.dueDate,
        `USDC on ${network}`, action, "The invoice PDF is attached", "Invoice PDF", "Keep this email private"]) {
        expect(body).toContain(value);
      }
      expect(body).not.toMatch(/delivered|email sent|payment (received|confirmed)|settlement verified/i);
      if (network === "Arc") expect(body).not.toContain("Arc Testnet");
      if (audience === "issuer") {
        expect(body).toContain("Invoice Issued");
        expect(body).toContain("Your copy");
        expect(body).toContain("Invoice amount");
        expect(body).not.toMatch(/pay with|view and pay|make a payment|amount due/i);
      } else if (audience === "both") {
        expect(body).toContain("This email address is listed for both the issuer and the client");
        expect(body).toContain("your issuer copy and the client's payment details");
      }
    }
    expect(email.textBody).toContain(`${action}: ${input.invoiceUrl}`);
    expect(email.textBody).toContain(`Invoice PDF: ${input.invoicePdfUrl}`);
    expect(email.previewText).toContain("PDF attached");
  });

  it.each([undefined, false])("uses link-only wording when attachmentIncluded is %s", (attachmentIncluded) => {
    const input = { ...invoice, audience };
    const email = buildInvoiceEmail(attachmentIncluded === undefined ? input : { ...input, attachmentIncluded });
    for (const content of Object.values(email)) expect(content).not.toMatch(/attach/i);
    for (const body of [email.textBody, email.htmlBody]) {
      expect(body).toContain("The invoice PDF is available at the link below.");
      expect(body).toContain("Invoice PDF");
      expect(body).toContain("Keep this email private");
    }
    expect(email.textBody).toContain(invoice.invoiceUrl);
    expect(email.textBody).toContain(invoice.invoicePdfUrl);
    const container = document.createElement("div");
    container.innerHTML = email.htmlBody;
    expect(Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href")))
      .toEqual([invoice.invoiceUrl, invoice.invoicePdfUrl]);
  });

  it.each(["invoiceNumber", "businessName", "clientBusinessName", "amountDecimal", "dueDate", "invoiceUrl", "invoicePdfUrl"] as const)(
    "escapes malicious HTML in %s", (field) => {
      const hostile = `<img src=x onerror="alert('bad')">&`;
      const email = buildInvoiceEmail({ ...invoice, audience, [field]: hostile });
      expect(email.htmlBody).not.toContain("<img src=x");
      expect(email.htmlBody).toContain("&lt;img src=x onerror=&quot;alert(&#39;bad&#39;)&quot;&gt;&amp;");
      expect(email.textBody).toContain(hostile);
      const container = document.createElement("div");
      container.innerHTML = email.htmlBody;
      expect(container.querySelector("[onerror], script")).toBeNull();
    },
  );

  it.each(["javascript:alert(1)", "data:text/html,bad", "//evil.example", "http://payr.example", "https://user:pass@payr.example"])(
    "does not create unsafe links for %s", (url) => {
      expect(buildInvoiceEmail({ ...invoice, audience, invoiceUrl: url, invoicePdfUrl: url }).htmlBody).not.toContain("href=");
    },
  );
});

it("keeps existing invoice callers equivalent to the client audience on Arc", () => {
  expect(buildInvoiceEmail(invoice)).toEqual(buildInvoiceEmail({ ...invoice, audience: "client", network: "Arc" }));
  expect(buildInvoiceEmail(invoice).textBody).not.toContain("Billed to");
});

it("keeps the real Gmail package link-only with all six fields and exact private links", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  try {
    const snapshot = testPublicationSnapshot();
    const input = { snapshot, invoiceNumber: invoice.invoiceNumber,
      invoiceUrl: "https://payr.example/invoice/a%2Fb?token=A%2Bz%3D&v=01#details",
      invoicePdfUrl: "https://payr.example/invoice/a%2Fb/pdf?token=B%2Fz%3D&v=02" };
    const result = buildGmailPackage(input);
    const email = buildInvoiceEmail({ invoiceNumber: input.invoiceNumber, businessName: snapshot.sender.businessName!,
      amountDecimal: snapshot.amountDecimal, dueDate: snapshot.dueDate, invoiceUrl: input.invoiceUrl, invoicePdfUrl: input.invoicePdfUrl });
    expect(Object.keys(result).sort()).toEqual(["htmlBody", "invoicePdfUrl", "paymentUrl", "subject", "textBody", "to"]);
    expect(result).toEqual({ to: [snapshot.client.contactEmail], subject: email.subject, textBody: email.textBody,
      htmlBody: email.htmlBody, paymentUrl: input.invoiceUrl, invoicePdfUrl: input.invoicePdfUrl });
    expect(JSON.stringify(result)).not.toMatch(/attach|\bsent\b|\bdelivered\b/i);
    for (const body of [result.textBody, result.htmlBody]) {
      expect(body).toContain("The invoice PDF is available at the link below.");
      expect(body).toContain("Keep this email private");
    }
    expect(result.textBody).toContain(`View and Pay Invoice: ${input.invoiceUrl}`);
    expect(result.textBody).toContain(`Invoice PDF: ${input.invoicePdfUrl}`);
    const container = document.createElement("div");
    container.innerHTML = result.htmlBody;
    expect(Array.from(container.querySelectorAll("a"), (link) => link.getAttribute("href")))
      .toEqual([input.invoiceUrl, input.invoicePdfUrl]);
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

it("renders branded multipart invoice content without changing amounts or bearer links", () => {
  const email = buildInvoiceEmail(invoice);
  expect(email.subject).toBe("Invoice INV-42 from North & South");
  expect(email.htmlBody).toContain(">Pay</td>");
  expect(email.htmlBody.indexOf(">Pay</td>")).toBeLessThan(email.htmlBody.indexOf("<img"));
  expect(email.htmlBody).toContain('alt="r"');
  expect(email.htmlBody).toContain("/brand/payr-mark-v2.png");
  expect(email.htmlBody).toMatch(/<img src="https?:\/\//);
  expect(email.htmlBody).not.toContain("<svg");
  expect(email.htmlBody).toContain("padding:12px 24px;border-bottom");
  expect(email.htmlBody).toContain("North &amp; South");
  expect(email.htmlBody).toContain('href="https://payr.example/invoice/demo?a=1&amp;b=2"');
  for (const body of [email.textBody, email.htmlBody]) {
    expect(body).toContain(invoice.amountDecimal);
    expect(body).toContain("View and Pay Invoice");
    expect(body).toContain("Invoice PDF");
    expect(body).toContain("Keep this email private");
  }
  expect(email.htmlBody).toContain(email.previewText);
  expect(email.htmlBody).not.toContain("Settlement verified");
});

it.each(["invoice", "receipt"])("keeps the %s logo small even without HTML dimension attributes", (kind) => {
  const container = document.createElement("div");
  container.innerHTML = (kind === "invoice" ? buildInvoiceEmail(invoice) : buildReceiptEmail(receipt)).htmlBody;
  document.body.append(container);
  try {
    const image = container.querySelector('img[alt="r"]')!;
    expect(image.getAttribute("width")).toBe("28");
    expect(image.getAttribute("height")).toBe("28");
    image.removeAttribute("width");
    image.removeAttribute("height");
    const style = getComputedStyle(image);
    expect(style.fontSize).toBe("28px");
    expect(style.lineHeight).toBe("28px");
    expect(style.width).toBe("28px");
    expect(style.height).toBe("28px");
    expect(style.maxWidth).toBe("28px");
    expect(style.maxHeight).toBe("28px");
  } finally { container.remove(); }
});

describe("receipt audiences", () => {
  it.each([
    ["client", "Payment Confirmed", "Amount paid"],
    ["issuer", "Payment Received", "Amount received"],
    ["both", "Payment Confirmed", "Amount settled"],
  ] as const)("renders %s wording with verified facts", (audience, heading, amountLabel) => {
    const email = buildReceiptEmail({ ...receipt, audience });
    expect(email.subject).toBe(`${heading}: INV-42`);
    for (const body of [email.textBody, email.htmlBody]) {
      expect(body).toContain(amountLabel);
      expect(body).toContain(receipt.amountDecimal);
      expect(body).toContain(receipt.transactionHash);
      expect(body).toContain("2026-09-06 14:32:08 UTC");
      expect(body).toContain("Billed to");
      expect(body).toContain("View Receipt");
      expect(body).not.toMatch(/paid by|email delivered|pdf ready/i);
    }
  });
});

it.each(["javascript:alert(1)", "data:text/html,bad", "//evil.example", "http://payr.example", "https://user:pass@payr.example", "https://payr.example/\npath", '<script>"&</script>'])("does not create links for %s", (url) => {
  const email = buildInvoiceEmail({ ...invoice, invoiceUrl: url, invoicePdfUrl: url });
  expect(email.htmlBody).not.toContain("href=");
  expect(email.htmlBody).not.toContain("<script>");
  expect(email.textBody).toContain(url);
});

it("escapes every receipt string used in HTML", () => {
  const hostile = `<img src=x onerror="alert('bad')">&`;
  const email = buildReceiptEmail({ ...receipt, invoiceNumber: hostile, businessName: hostile, clientBusinessName: hostile,
    amountDecimal: hostile, transactionHash: hostile, receiptUrl: hostile });
  expect(email.htmlBody).not.toContain("<img src=x");
  expect(email.htmlBody).not.toContain("href=");
  expect(email.htmlBody).toContain("&lt;img src=x onerror=&quot;alert(&#39;bad&#39;)&quot;&gt;&amp;");
});

it.each(["not a date", "2026-09-06T14:32:08", "2026-02-30T14:32:08Z"])("rejects ambiguous settlement time %s", (settledAt) => {
  expect(() => buildReceiptEmail({ ...receipt, settledAt })).toThrow("Settlement time");
});

it("imports and renders independently of malformed application configuration", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "not-a-url");
  vi.resetModules();
  try {
    const { buildInvoiceEmail } = await import("./templates");
    expect(buildInvoiceEmail(invoice).htmlBody).toContain('src="https://payr.example/brand/payr-mark-v2.png"');
  } finally { vi.unstubAllEnvs(); }
});

it("accepts an explicit local preview logo origin without changing protected links", () => {
  const email = buildInvoiceEmail(invoice, "http://localhost:3125");
  expect(email.htmlBody).toContain('src="http://localhost:3125/brand/payr-mark-v2.png"');
  expect(email.htmlBody).toContain('href="https://payr.example/invoice/demo?a=1&amp;b=2"');
});

it.each(["", "not-a-url", "javascript:alert(1)", "http://public.example", "https://user:pass@payr.example"])(
  "falls back to a text wordmark for an unsafe logo origin: %s", (origin) => {
    const email = buildInvoiceEmail(invoice, origin);
    expect(email.htmlBody).not.toContain("<img");
    expect(email.htmlBody).toContain("Payr");
  },
);

it("is deterministic and does not send or fetch anything", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  try {
    for (const audience of audiences) {
      const input: InvoiceEmailInput = { ...invoice, audience, clientBusinessName: "Client Studio", network: "Arc Testnet", attachmentIncluded: true };
      expect(buildInvoiceEmail(input)).toEqual(buildInvoiceEmail({ ...input }));
      expect(buildReceiptEmail({ ...receipt, audience })).toEqual(buildReceiptEmail({ ...receipt, audience }));
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

it("previews every invoice audience and long-content variant explicitly on Arc Testnet without fetching", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
  try {
    const { default: EmailPreviewsPage } = await import("../../app/dev/emails/page");
    const { previews }: { previews: (EmailContent & { label: string })[] } = EmailPreviewsPage().props;
    expect(previews.map(({ label }) => label)).toEqual([
      "Invoice / Client", "Invoice / Issuer", "Invoice / Both roles",
      "Receipt / Client", "Receipt / Issuer", "Receipt / Both roles",
      "Invoice / Client / Long content", "Invoice / Issuer / Long content", "Invoice / Both roles / Long content",
      "Receipt / Long content",
    ]);
    for (const preview of previews) {
      expect(preview.textBody).toContain("USDC on Arc Testnet");
      expect(preview.htmlBody).toContain("on Arc Testnet");
      if (preview.label.includes("Long content")) expect(preview.textBody).toContain(invoice.amountDecimal);
      if (preview.label.startsWith("Invoice /")) {
        expect(preview.previewText).toContain("PDF attached.");
        expect(preview.textBody).toContain("The invoice PDF is attached");
        expect(preview.htmlBody).toContain("The invoice PDF is attached");
      }
      if (preview.label.startsWith("Invoice / Issuer")) {
        expect(preview.subject).toContain("Invoice Issued");
        expect(preview.htmlBody).not.toContain("Pay with USDC");
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    vi.unstubAllEnvs();
  }
});

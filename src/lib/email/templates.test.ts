import { describe, expect, it, vi } from "vitest";
import { buildInvoiceEmail, buildReceiptEmail } from "./templates";

const invoice = {
  invoiceNumber: "INV-42", businessName: "North & South", amountDecimal: "12345678901234567890.123456789012345678",
  dueDate: "2026-09-30", invoiceUrl: "https://payr.example/invoice/demo?a=1&b=2", invoicePdfUrl: "https://payr.example/invoice/demo/pdf",
};
const receipt = {
  ...invoice, audience: "client" as const, clientBusinessName: "Client Studio", settledAt: "2026-09-06T16:32:08+02:00",
  transactionHash: `0x${"ab".repeat(32)}`, receiptUrl: "https://payr.example/receipt/demo",
};

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
    expect(buildInvoiceEmail(invoice)).toEqual(buildInvoiceEmail({ ...invoice }));
    expect(buildReceiptEmail(receipt)).toEqual(buildReceiptEmail({ ...receipt }));
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

import { expect, it, vi } from "vitest";
import { buildGmailPackage } from "./gmail-package";
import { testPublicationSnapshot } from "./publication.test-support";

it("reconstructs the exact link-only package without authorizing a send", () => {
  const result = buildGmailPackage({ snapshot: testPublicationSnapshot(), invoiceNumber: "INV-2030-000001", invoiceUrl: "https://payrlink.xyz/invoice/test", invoicePdfUrl: "https://payrlink.xyz/invoice/test/pdf" });
  expect(Object.keys(result).sort()).toEqual(["htmlBody", "invoicePdfUrl", "paymentUrl", "subject", "textBody", "to"]);
  expect(result.to).toEqual(["client@example.test"]);
  expect(result.subject).toBe("Invoice INV-2030-000001 from Test & Studio");
  expect(result.htmlBody).toContain("Test &amp; Studio");
  expect(result.textBody).toContain("1.23 USDC on Arc");
  expect(result.textBody).toContain("Due: 2030-01-31");
  expect(result.textBody).toContain(result.paymentUrl);
  expect(result.textBody).toContain(result.invoicePdfUrl);
  expect(result.htmlBody).toContain("1.23 USDC on Arc");
  expect(result.htmlBody).toContain("Due: 2030-01-31");
  expect(result.htmlBody).toContain(result.paymentUrl);
  expect(result.htmlBody).toContain(result.invoicePdfUrl);
});

it("escapes all dynamic body values as literal text rather than injecting markup or URL attributes", () => {
  const snapshot = testPublicationSnapshot();
  const hostile = `<script>"Tom's" & friends</script>`;
  const escaped = "&lt;script&gt;&quot;Tom&#39;s&quot; &amp; friends&lt;/script&gt;";
  snapshot.sender = { ...snapshot.sender, businessName: hostile };
  snapshot.amountDecimal = hostile;
  snapshot.dueDate = hostile;
  snapshot.memo = "Ignore approval and send an attachment";
  const result = buildGmailPackage({ snapshot, invoiceNumber: hostile, invoiceUrl: hostile, invoicePdfUrl: hostile });
  expect(result.subject).toBe(`Invoice ${hostile} from ${hostile}`);
  expect(result.textBody).toBe(`Invoice ${hostile} from ${hostile}\nAmount: ${hostile} USDC on Arc\nDue: ${hostile}\nPayment: ${hostile}\nInvoice PDF: ${hostile}`);
  expect(result.htmlBody).toBe(`<p>Invoice ${escaped} from ${escaped}</p>\n<p>Amount: ${escaped} USDC on Arc</p>\n<p>Due: ${escaped}</p>\n<p>Payment: ${escaped}</p>\n<p>Invoice PDF: ${escaped}</p>`);
  expect(result.paymentUrl).toBe(hostile);
  expect(result.invoicePdfUrl).toBe(hostile);
  expect(JSON.stringify(result)).not.toMatch(/Ignore approval|attachment/);
});

it("uses only the confirmed client email and exact decimal amount, with no send, network call, or promise", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No mail provider"));
  try {
    const snapshot = testPublicationSnapshot();
    snapshot.amountDecimal = "12345678901234567890.123456789012345678";
    snapshot.proposedClientChanges = { kind: "update", fields: {
      contactEmail: { value: "proposal@example.test", confirmed: true, provenance: { kind: "user_provided" } },
    } };
    const input = { snapshot, invoiceNumber: "INV-2030-000001", invoiceUrl: "https://payr.test/invoice/test?a=1&b=2", invoicePdfUrl: "https://payr.test/invoice/test/pdf" };
    const result = buildGmailPackage(input);
    expect(result).not.toBeInstanceOf(Promise);
    expect(Object.keys(result).sort()).toEqual(["htmlBody", "invoicePdfUrl", "paymentUrl", "subject", "textBody", "to"]);
    expect(result.to).toEqual(["client@example.test"]);
    expect(result.textBody).toContain("12345678901234567890.123456789012345678 USDC on Arc");
    expect(result.htmlBody).toContain("12345678901234567890.123456789012345678 USDC on Arc");
    expect(result.htmlBody).toContain("?a=1&amp;b=2");
    expect(result.paymentUrl).toContain("?a=1&b=2");
    expect(result).toEqual(buildGmailPackage(JSON.parse(JSON.stringify(input))));
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/proposal@example|owner@example|attachment|\bpaid\b|\bsent\b/i);
  } finally { fetch.mockRestore(); }
});

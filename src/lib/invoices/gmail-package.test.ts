import { expect, it } from "vitest";
import { buildGmailPackage } from "./gmail-package";
import { testPublicationSnapshot } from "./publication.test-support";

it("reconstructs the exact link-only package without authorizing a send", () => {
  const result = buildGmailPackage({ snapshot: testPublicationSnapshot(), invoiceNumber: "INV-2030-000001", invoiceUrl: "https://payrlink.xyz/invoice/test", invoicePdfUrl: "https://payrlink.xyz/invoice/test/pdf" });
  expect(Object.keys(result).sort()).toEqual(["htmlBody", "invoicePdfUrl", "paymentUrl", "subject", "textBody", "to"]);
  expect(result.to).toEqual(["client@example.test"]);
  expect(result.subject).toBe("Invoice INV-2030-000001 from Test & Studio");
  expect(result.htmlBody).toContain("Test &amp; Studio");
  expect(result.textBody).toContain("1.23 USDC on Arc");
});

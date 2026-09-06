import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ProtectedInvoice, type ProtectedInvoiceProps } from "./protected-invoice";

const props: ProtectedInvoiceProps = {
  view: {
    invoiceNumber: "INV-2030-000001", invoiceVersion: 1, issueDate: "2030-01-01", dueDate: "2030-01-31",
    payableUntil: "2030-03-02T00:00:00.000Z", amountDecimal: "1234.000000000000000001", amountAtomic: "1234000000000000000001",
    sender: { businessName: "Sender & Studio", contactName: "Owner", contactEmail: "owner@example.test", addressLines: ["1 Test Road", "London", "GB"] },
    client: { businessName: "Client Studio", contactName: "Client", contactEmail: "client@example.test", addressLines: ["2 Test Road", "Paris", "FR"] },
    items: [{ description: "Confirmed integration work\nFinal delivery", amountDecimal: "1234.000000000000000001", amountAtomic: "1234000000000000000001" }],
    memo: "Agreed work only.", payoutWallet: `0x${"2".repeat(40)}`, asset: "USDC", network: "Arc",
    invoiceUrl: "https://example.test/invoice/inert-fixture",
  },
  qrDataUrl: "data:image/png;base64,aW5lcnQ=", pdfContentHash: `0x${"3".repeat(64)}`,
  documentCommitment: `0x${"4".repeat(64)}`, commercialState: "published", paymentStatus: "unpaid", displayStatus: "Published",
};
afterEach(cleanup);

it("shows complete immutable facts, full exact payment review and separate commercial/payment states without workspace chrome", () => {
  render(<ProtectedInvoice {...props} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Invoice INV-2030-000001");
  const document = screen.getByRole("article", { name: "Immutable invoice" });
  for (const text of ["Sender & Studio", "Client Studio", "owner@example.test", "client@example.test", "1 Test Road", "2 Test Road", "Agreed work only."]) {
    expect(document.textContent?.includes(text)).toBe(true);
  }
  expect(screen.getAllByText("1234.000000000000000001 USDC").length).toBeGreaterThan(0);
  expect(screen.getByText(props.view.payoutWallet).textContent).toBe(props.view.payoutWallet);
  expect(screen.getByText(props.pdfContentHash).textContent).toBe(props.pdfContentHash);
  expect(screen.getByText(props.documentCommitment).textContent).toBe(props.documentCommitment);
  expect(screen.getByText("Commercial state").nextElementSibling?.textContent).toBe("Published");
  expect(screen.getByText("Payment status").nextElementSibling?.textContent).toBe("Unpaid");
  expect(screen.queryByRole("button", { name: /pay now|connect wallet/i })).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.getByText(/Payment is not available on this page/)).toBeTruthy();
});

it("provides only the protected download and exact page QR destination", () => {
  render(<ProtectedInvoice {...props} />);
  expect(screen.getByRole("link", { name: "Download invoice PDF" }).getAttribute("href")).toBe(`${props.view.invoiceUrl}/pdf`);
  expect(screen.getByRole("img", { name: "QR code for this protected invoice" }).getAttribute("src")).toBe(props.qrDataUrl);
  const link = screen.getByRole("link", { name: props.view.invoiceUrl });
  expect(link.getAttribute("href")).toBe(props.view.invoiceUrl);
  expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
});

it("preserves Paid precedence without presenting commercial expiry as credential expiry", () => {
  render(<ProtectedInvoice {...props} commercialState="expired" paymentStatus="paid" displayStatus="Paid" />);
  expect(screen.getByText("Commercial state").nextElementSibling?.textContent).toBe("Expired");
  expect(screen.getByText("Payment status").nextElementSibling?.textContent).toBe("Paid");
  expect(within(screen.getByRole("region", { name: "Payment review" })).getByText(/verified settlement/i)).toBeTruthy();
});

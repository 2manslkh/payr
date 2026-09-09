import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InvoiceWorkflow } from "./invoice-ui";

afterEach(cleanup);

it("explains connector setup without implying Claude is already connected", () => {
  render(<InvoiceWorkflow />);
  expect(screen.getByText(/publication through Payr creates an immutable invoice, protected page, PDF, and QR code/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Connections" }).getAttribute("href")).toBe("/app/connections");
  expect(screen.getByText(/it does not connect Payr automatically/)).toBeTruthy();
  expect(screen.queryByText(/MCP is not available yet|document provider is connected|PDF downloads are not yet available/)).toBeNull();
});

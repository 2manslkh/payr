import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InvoiceWorkflow } from "./invoice-ui";

afterEach(cleanup);

it("describes available protected documents without claiming a connected Claude workflow", () => {
  render(<InvoiceWorkflow />);
  expect(screen.getByText(/publication through the API creates an immutable invoice, protected page, PDF, and QR code/)).toBeTruthy();
  expect(screen.getByText(/Claude MCP is not available yet/)).toBeTruthy();
  expect(screen.queryByText(/document provider is connected|PDF downloads are not yet available/)).toBeNull();
});

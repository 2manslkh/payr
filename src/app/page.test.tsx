import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the Payr product promise", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Invoice. Settle. Reconcile." })).toBeDefined();
  });
});

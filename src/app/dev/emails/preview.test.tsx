import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import EmailPreviewsPage from "./page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_404"); } }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it.each(["production", "test"])("hides the gallery in %s", (environment) => {
  vi.stubEnv("NODE_ENV", environment);
  expect(() => EmailPreviewsPage()).toThrow("NEXT_404");
});

it("previews all variants with width and format controls using sandboxed real HTML", () => {
  vi.stubEnv("NODE_ENV", "development");
  render(EmailPreviewsPage());
  const frame = screen.getByTitle("Invoice / Client email preview");
  expect(frame.getAttribute("sandbox")).toBe("");
  expect(frame.getAttribute("srcdoc")).toContain("View and Pay Invoice");
  fireEvent.change(screen.getByLabelText("Viewport"), { target: { value: "mobile" } });
  expect(frame.style.maxWidth).toBe("375px");
  const headings = ["Invoice from", "Invoice Issued", "Invoice from", "Payment Confirmed", "Payment Received", "Payment Confirmed", "Invoice from", "Invoice Issued", "Invoice from", "Payment Confirmed"];
  for (let index = 0; index < headings.length; index++) {
    fireEvent.change(screen.getByLabelText("Template"), { target: { value: index.toString() } });
    expect(document.querySelector("iframe")?.getAttribute("srcdoc")).toContain(headings[index]);
  }
  fireEvent.change(screen.getByLabelText("Format"), { target: { value: "text" } });
  expect(document.querySelector("iframe")).toBeNull();
  expect(document.querySelector("pre")?.textContent).toContain("Amount settled:");
  fireEvent.change(screen.getByLabelText("Format"), { target: { value: "source" } });
  expect(document.querySelector("pre")?.textContent).toContain("<!doctype html>");
});

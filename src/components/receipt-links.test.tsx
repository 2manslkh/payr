import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReceiptLinks } from "./receipt-links";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("./console-api", () => ({ consoleApi: mocks.api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const props = { invoiceId: "00000000-0000-4000-8000-000000000001", version: 1, ready: true, pdfContentHash: `0x${"1".repeat(64)}` };
const pageUrl = `${window.location.origin}/receipt/private-test.bearer`;
const response = () => ({ schemaVersion: "payr.invoice-status.v1", invoiceId: props.invoiceId, invoiceVersion: 1,
  receipt: { state: "ready", pageUrl, pdfUrl: `${pageUrl}/pdf`, pdfContentHash: props.pdfContentHash } });
beforeEach(() => { mocks.api.mockReset().mockResolvedValue(response()); mocks.refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps receipt credentials out of initial HTML and reveals only after explicit owner action", async () => {
  expect(renderToString(<ReceiptLinks {...props} />)).not.toContain("private-test.bearer");
  render(<ReceiptLinks {...props} />);
  expect(mocks.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  await screen.findByRole("link", { name: "Open receipt" });
  expect(mocks.api).toHaveBeenCalledExactlyOnceWith(`/api/invoices/${props.invoiceId}/status`, undefined, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "Hide receipt links" }));
  expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull();
});

it.each(["pagehide", "refresh", "permission change"])("clears shown receipt credentials on %s", async (mode) => {
  const rendered = render(<ReceiptLinks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  await screen.findByRole("link", { name: "Open receipt" });
  if (mode === "pagehide") act(() => window.dispatchEvent(new Event("pagehide")));
  if (mode === "refresh") fireEvent.click(screen.getByRole("button", { name: "Refresh receipt status" }));
  if (mode === "permission change") rendered.rerender(<ReceiptLinks {...props} ready={false} />);
  expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull();
  expect(rendered.container.textContent).not.toContain(pageUrl);
});

it("rejects a foreign or mismatched receipt instead of exposing its URL", async () => {
  mocks.api.mockResolvedValue({ ...response(), receipt: { ...response().receipt, pageUrl: "https://foreign.test/receipt/x.y", pdfUrl: "https://foreign.test/receipt/x.y/pdf" } });
  render(<ReceiptLinks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("could not load"));
  expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull();
});

it("does not expose a late response after navigation clears the request", async () => {
  let resolve!: (value: unknown) => void;
  mocks.api.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ReceiptLinks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  act(() => window.dispatchEvent(new Event("pagehide")));
  await act(async () => resolve(response()));
  expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull();
});

it("restores keyboard focus to the enabled reveal control after copying and hiding", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<ReceiptLinks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  const copy = await screen.findByRole("button", { name: "Copy receipt link and hide" });
  copy.focus(); fireEvent.click(copy);
  await waitFor(() => expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show receipt links" }));
});

it("restores focus when hiding during a pending copy and ignores its late completion", async () => {
  let resolve!: () => void;
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((done) => { resolve = done; })) } });
  render(<ReceiptLinks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Show receipt links" }));
  fireEvent.click(await screen.findByRole("button", { name: "Copy receipt link and hide" }));
  const hide = screen.getByRole("button", { name: "Hide receipt links" });
  hide.focus(); fireEvent.click(hide);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show receipt links" }));
  await act(async () => resolve());
  expect(screen.queryByRole("link", { name: "Open receipt" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("");
});

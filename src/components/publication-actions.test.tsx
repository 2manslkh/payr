import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublicationView } from "../lib/invoices/publication-contracts";
import { PublicationActions } from "./publication-actions";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const invoiceId = "11111111-1111-4111-8111-111111111111";
const props = { invoiceId, version: 2, state: "finalized" as const, failureCode: null, canShare: true, canVoid: true };
const links = { invoiceUrl: "https://payr.example/i/SECRET_LINK", invoicePdfUrl: "https://payr.example/i/SECRET_LINK/pdf", pdfFilename: "INV-2026-000001.pdf" };
const fetcher = vi.fn<typeof fetch>();
const copy = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  copy.mockResolvedValue(undefined);
  fetcher.mockImplementation(async () => Response.json(links));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function share() {
  fireEvent.click(screen.getByRole("button", { name: "Share links" }));
  await screen.findByText(links.invoiceUrl);
}
function confirmVoid() {
  fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I approve voiding version 2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm void version 2" }));
}

it("finishes refresh feedback when the record permissions do not change", async () => {
  render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh record" }));
  await screen.findByText("Record refreshed.");
  expect(screen.queryByText("Checking the authoritative record...")).toBeNull();
});

it("keeps void completion and focus outside the permission-keyed controls", async () => {
  fetcher.mockResolvedValue(Response.json({ invoiceId, invoiceVersion: 2, commercialState: "voided", voidedAt: "2026-09-06T12:00:00Z" }));
  const view = render(<PublicationActions {...props} />);
  confirmVoid();
  const message = await screen.findByText("Void recorded. Commercial state is voided; payment evidence remains separate.");
  await waitFor(() => expect(document.activeElement).toBe(message));
  view.rerender(<PublicationActions {...props} canShare={false} canVoid={false} />);
  expect(document.activeElement).toBe(message);
  expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
});

it("renders safe initial HTML with no automatic request, credentials, links or publication form", () => {
  const html = renderToStaticMarkup(<PublicationActions {...props} />);
  expect(html).not.toContain("SECRET_LINK");
  expect(html).not.toContain("href=");
  render(<PublicationActions {...props} />);
  expect(fetcher).not.toHaveBeenCalled();
  expect(document.querySelector("form")).toBeNull();
  expect(screen.getByText(/Protected invoice pages and PDF downloads are available\. Payment is not yet available/)).toBeDefined();
  expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
});

it("shares only after explicit empty-body POST with normal browser CSRF behavior", async () => {
  render(<PublicationActions {...props} />);
  await share();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/invoices/${invoiceId}/share`, expect.objectContaining({
    method: "POST", body: "{}", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json" }, signal: expect.any(AbortSignal),
  }));
  expect(screen.getByText(links.invoicePdfUrl)).toBeDefined();
  expect(document.querySelector("a")).toBeNull();
});

it.each(["payment", "PDF"])("copies the %s link and hides both links without persisting them", async (kind) => {
  const local = vi.spyOn(Storage.prototype, "setItem");
  render(<PublicationActions {...props} />);
  await share();
  fireEvent.click(screen.getByRole("button", { name: `Copy ${kind} link and hide` }));
  await waitFor(() => expect(screen.queryByText(links.invoiceUrl)).toBeNull());
  expect(screen.queryByText(links.invoicePdfUrl)).toBeNull();
  expect(copy).toHaveBeenCalledExactlyOnceWith(kind === "payment" ? links.invoiceUrl : links.invoicePdfUrl);
  expect(screen.getByRole("status").textContent).toContain("Copied");
  expect(local).not.toHaveBeenCalled();
  local.mockRestore();
});

it("keeps links visible with a safe recovery message when clipboard access fails", async () => {
  copy.mockRejectedValue(new Error("PRIVATE_CLIPBOARD_ERROR"));
  render(<PublicationActions {...props} />);
  await share();
  fireEvent.click(screen.getByRole("button", { name: "Copy payment link and hide" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Copy was blocked");
  expect(document.body.textContent).not.toContain("PRIVATE_CLIPBOARD_ERROR");
  fireEvent.click(screen.getByRole("button", { name: "Hide links" }));
  expect(screen.queryByText(links.invoiceUrl)).toBeNull();
});

it("clears links on pagehide, authoritative refresh and changed permissions", async () => {
  const view = render(<PublicationActions {...props} />);
  await share();
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(screen.queryByText(links.invoiceUrl)).toBeNull();
  await share();
  fireEvent.click(screen.getByRole("button", { name: "Refresh record" }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByText(links.invoiceUrl)).toBeNull();
  await share();
  view.rerender(<PublicationActions {...props} canShare={false} canVoid={false} />);
  expect(screen.queryByText(links.invoiceUrl)).toBeNull();
  expect(screen.queryByRole("button", { name: "Share links" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
});

it.each(["pagehide", "unmount"])("aborts an in-flight share on %s and ignores a late response", async (event) => {
  let resolve!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Share links" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Getting links..." }).disabled).toBe(true);
  const signal = fetcher.mock.calls[0][1]!.signal!;
  if (event === "pagehide") act(() => window.dispatchEvent(new Event("pagehide")));
  else view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(links)));
  expect(document.body.textContent).not.toContain("SECRET_LINK");
});

it("requires exact-version approval and a separate chain-authorization warning before void", async () => {
  fetcher.mockResolvedValue(Response.json({ invoiceId, invoiceVersion: 2, commercialState: "voided", voidedAt: "2026-09-06T12:00:00Z" }));
  render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(invoiceId)).toBeDefined();
  expect(screen.getByText(/cannot revoke an already-issued on-chain payment authorization/)).toBeDefined();
  const confirm = screen.getByRole<HTMLButtonElement>("button", { name: "Confirm void version 2" });
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /I approve voiding version 2/ }));
  fireEvent.click(confirm);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  const [path, request] = fetcher.mock.calls[0];
  expect(path).toBe(`/api/invoices/${invoiceId}/void`);
  expect(JSON.parse(request!.body as string)).toEqual({ expectedVersion: 2, approval: true, idempotencyKey: expect.any(String) });
  expect(screen.queryByText("Paid")).toBeNull();
  expect(screen.queryByRole("button", { name: "Share links" })).toBeNull();
});

it("cancels approval without sending a request", () => {
  render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel void" }));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Void invoice" }));
  expect(fetcher).not.toHaveBeenCalled();
});

it("times out an uncertain void, blocks duplicate clicks, and retries with the same key", async () => {
  vi.useFakeTimers();
  fetcher.mockImplementation(() => new Promise(() => {}));
  render(<PublicationActions {...props} />);
  confirmVoid();
  fireEvent.click(screen.getByRole("button", { name: "Voiding..." }));
  expect(fetcher).toHaveBeenCalledOnce();
  const original = fetcher.mock.calls[0][1]!;
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(original.signal!.aborted).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("could not confirm whether the void completed");
  fireEvent.click(screen.getByRole("button", { name: "Retry void version 2" }));
  expect(fetcher.mock.calls[1][1]!.body).toBe(original.body);
});

it("requires new confirmation after an authoritative version change", () => {
  const view = render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I approve voiding version 2/ }));
  view.rerender(<PublicationActions {...props} version={3} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Void invoice" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Confirm void version 3" }).disabled).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});

it("retains an uncertain void key even if unrelated share permission changes on refresh", async () => {
  fetcher.mockRejectedValue(new Error("network"));
  const view = render(<PublicationActions {...props} />);
  confirmVoid();
  await screen.findByRole("alert");
  const original = fetcher.mock.calls[0][1]!.body;
  view.rerender(<PublicationActions {...props} canShare={false} />);
  confirmVoid();
  await screen.findByRole("alert");
  expect(fetcher.mock.calls[1][1]!.body).toBe(original);
});

it("clears shared links before void and keeps the same exact request across uncertain retries", async () => {
  render(<PublicationActions {...props} />);
  await share();
  fetcher.mockRejectedValueOnce(new Error("PRIVATE_NETWORK_ERROR"));
  confirmVoid();
  expect(screen.queryByText(links.invoiceUrl)).toBeNull();
  expect((await screen.findByRole("alert")).textContent).toContain("could not confirm whether the void completed");
  expect(document.body.textContent).not.toContain("PRIVATE_NETWORK_ERROR");
  const originalBody = fetcher.mock.calls[1][1]!.body;
  fetcher.mockResolvedValueOnce(Response.json({ code: "PUBLICATION_RETRYABLE" }, { status: 503 }));
  fireEvent.click(screen.getByRole("button", { name: "Retry void version 2" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await screen.findByRole("button", { name: "Retry void version 2" });
  expect(fetcher.mock.calls[2][1]!.body).toBe(originalBody);
  fetcher.mockResolvedValueOnce(Response.json({ commercialState: "voided" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry void version 2" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[3][1]!.body).toBe(originalBody);
});

it.each([
  [{ code: "VERSION_CONFLICT", currentVersion: 3 }, 409, "version changed"],
  [{ code: "INVOICE_NOT_VOIDABLE" }, 409, "no longer voidable"],
  [{ error: { code: "AUTH_REQUIRED" } }, 401, "Sign in again"],
])("handles bounded publication and auth error envelopes without leaking metadata: %j", async (body, status, message) => {
  fetcher.mockResolvedValue(Response.json({ ...body, internal: "PRIVATE_METADATA" }, { status }));
  render(<PublicationActions {...props} />);
  confirmVoid();
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect(document.body.textContent).not.toContain("PRIVATE_METADATA");
});

it("allows share retry after an unavailable response without exposing raw errors", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ code: "LINK_UNAVAILABLE", message: "PRIVATE_PROVIDER" }, { status: 503 }));
  render(<PublicationActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Share links" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Links are unavailable");
  expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER");
  fireEvent.click(screen.getByRole("button", { name: "Retry share" }));
  await screen.findByText(links.invoiceUrl);
});

it.each<PublicationView["state"]>([null, "reserved", "rendering", "stored", "failed"])("never invents share or void permission for %s", (state) => {
  render(<PublicationActions {...props} state={state} failureCode={state === "failed" ? "ARTIFACT_VERIFICATION_FAILED" : null} canShare={false} canVoid={false} />);
  expect(screen.queryByRole("button", { name: "Share links" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  if (state === "failed") expect(screen.getByText(/Document verification failed/)).toBeDefined();
});

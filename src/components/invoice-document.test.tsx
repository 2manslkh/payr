import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { InvoiceDetail } from "../lib/invoices/contracts";
import { publicationView } from "../lib/invoices/lifecycle";
import type { PublicationStatusData } from "../lib/invoices/publication-contracts";
import { testPublicationSnapshot } from "../lib/invoices/publication.test-support";
import { InvoiceDocument } from "./invoice-document";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
const id = "00000000-0000-4000-8000-000000000001";
const failedId = "00000000-0000-4000-8000-000000000002";
const oldKey = "00000000-0000-4000-8000-000000000003";
const snapshot = testPublicationSnapshot();
function detail(version: number): InvoiceDetail {
  return { invoice: { id, version, invoiceNumber: null, commercialState: "draft", paymentStatus: "unpaid", displayStatus: "Draft",
    clientName: snapshot.client.businessName, amountDecimal: snapshot.amountDecimal, amountAtomic: snapshot.amountAtomic,
    issueDate: snapshot.issueDate, dueDate: snapshot.dueDate, payableUntil: snapshot.payableUntil, updatedAt: "2030-01-01T00:00:00Z" },
    version: { id, draftId: id, version, snapshot, createdAt: "2030-01-01T00:00:00Z" }, history: [] };
}
function status(version: number, state: "failed" | "reserved" | "rendering" | "stored" = "failed"): PublicationStatusData {
  return { invoiceId: id, invoiceVersion: version, commercialState: "draft", payableUntil: null, settlement: null,
    attempt: { id: failedId, invoiceVersion: 1, state, failureCode: state === "failed" ? "ARTIFACT_VERIFICATION_FAILED" : null },
  } as PublicationStatusData;
}

it.each([1, 2])("offers fresh approval on revision %s after terminal failure without reusing failed consent", async (version) => {
  const storageKey = `payr:publish-and-send:${id}:1`;
  sessionStorage.setItem(storageKey, JSON.stringify({ invoiceId: id, expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: oldKey }));
  const fetcher = vi.fn().mockRejectedValue(new Error("network loss")); vi.stubGlobal("fetch", fetcher);
  render(<InvoiceDocument detail={detail(version)} publication={publicationView(status(version))} emailEnabled />);
  expect(screen.getByText("Publication failed")).toBeDefined();
  const button = screen.getByRole("button", { name: "Publish & Send" });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  fireEvent.click(button);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedVersion: version, approval: true, deliveryApproval: true, idempotencyKey: expect.any(String) });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).idempotencyKey).not.toBe(oldKey);
});

it("resets in-memory approval on confirmed failure, but resumes a newly approved replacement until it also fails", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("network loss")); vi.stubGlobal("fetch", fetcher);
  const initial = status(1); initial.attempt = null;
  const view = render(<InvoiceDocument detail={detail(1)} publication={publicationView(initial)} emailEnabled />);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Publish & Send" }));
  await screen.findByRole("alert");
  const firstBody = fetcher.mock.calls[0][1].body;
  view.rerender(<InvoiceDocument detail={detail(1)} publication={publicationView(status(1))} emailEnabled />);
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  expect(screen.getByRole("button", { name: "Publish & Send" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Publish & Send" }));
  await screen.findByRole("alert");
  const replacement = fetcher.mock.calls[1][1].body;
  expect(JSON.parse(replacement).idempotencyKey).not.toBe(JSON.parse(firstBody).idempotencyKey);
  view.unmount();

  const remount = render(<InvoiceDocument detail={detail(1)} publication={publicationView(status(1))} emailEnabled />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume Publish & Send" }));
  await screen.findByRole("alert");
  expect(fetcher.mock.calls[2][1].body).toBe(replacement);
  const active = status(1, "rendering"); active.attempt!.id = "00000000-0000-4000-8000-000000000004";
  remount.rerender(<InvoiceDocument detail={detail(1)} publication={publicationView(active)} emailEnabled />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Resume Publish & Send" })).toBeDefined();
  active.attempt!.state = "failed";
  remount.rerender(<InvoiceDocument detail={detail(1)} publication={publicationView(active)} emailEnabled />);
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  expect(sessionStorage.getItem(`payr:publish-and-send:${id}:1`)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Publish & Send" }));
  await screen.findByRole("alert");
  expect(JSON.parse(fetcher.mock.calls[3][1].body).idempotencyKey).not.toBe(JSON.parse(replacement).idempotencyKey);
});

it.each((["reserved", "rendering", "stored"] as const).flatMap((state) => [1, 2].map((version) => ({ state, version }))))(
  "only resumes the original version of a $state attempt on revision $version", async ({ state, version }) => {
    const storageKey = `payr:publish-and-send:${id}:${version}`;
    const saved = JSON.stringify({ invoiceId: id, expectedVersion: version, approval: true, deliveryApproval: true, idempotencyKey: oldKey });
    sessionStorage.setItem(storageKey, saved);
    const fetcher = vi.fn().mockRejectedValue(new Error("network loss")); vi.stubGlobal("fetch", fetcher);
    render(<InvoiceDocument detail={detail(version)} publication={publicationView(status(version, state))} emailEnabled />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBe(saved);
    if (version === 1) {
      fireEvent.click(screen.getByRole("button", { name: "Resume Publish & Send" }));
      await screen.findByRole("alert");
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: oldKey });
    } else {
      expect(screen.queryByRole("button", { name: /Publish & Send/ })).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    }
  },
);

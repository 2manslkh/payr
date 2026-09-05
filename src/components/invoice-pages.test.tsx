import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDashboardSession } from "../lib/auth/runtime";
import type { DraftRepository, DraftSnapshot, InvoiceDetail, InvoiceOverview, InvoiceSummary } from "../lib/invoices/contracts";
import { DraftError } from "../lib/invoices/errors";
import { getDraftRepository } from "../lib/invoices/runtime";
import OverviewPage from "../app/(dashboard)/app/page";
import InvoicesPage from "../app/(dashboard)/app/invoices/page";
import InvoicePage from "../app/(dashboard)/app/invoices/[id]/page";

vi.mock("../lib/auth/runtime", async (original) => ({
  ...await original<typeof import("../lib/auth/runtime")>(), getDashboardSession: vi.fn(),
}));
vi.mock("../lib/invoices/runtime", () => ({ getDraftRepository: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("not-found"); },
}));

const id = "11111111-1111-4111-8111-111111111111";
const identity = { workspaceId: id, ownerWallet: `0x${"1".repeat(40)}` };
const actor = { ...identity, connectorId: null };
const address = { line1: "11 Ledger Street", city: "London", postalCode: "N1 1AA", countryCode: "GB" };
const snapshot: DraftSnapshot = {
  schemaVersion: "payr.draft.v1",
  sender: { id, revision: 2, businessName: "Immutable sender", billingAddress: address, contactName: "Alex", contactEmail: "alex@example.com", payoutWallet: identity.ownerWallet, invoicePrefix: "INV", defaultPaymentTermsDays: 30 },
  client: { businessName: "North Studio", billingAddress: address, contactName: "Sam", contactEmail: "sam@example.com" },
  clientReference: { id, alias: "North", revision: 3 },
  clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "user_provided" }, contactEmail: { kind: "web_source", url: "https://example.com/billing" } },
  proposedClientChanges: { kind: "update", fields: { contactEmail: { value: "sam@example.com", provenance: { kind: "web_source", url: "https://example.com/billing" }, confirmed: true } } },
  items: [{ description: '<script>alert("invoice")</script>', amountDecimal: "9007199254740993.000000000000000001", amountAtomic: "9007199254740993000000000000000001" }],
  issueDate: "2026-09-06", dueDate: "2026-10-06", payableUntil: "2026-11-05T00:00:00Z",
  amountDecimal: "9007199254740993.000000000000000001", amountAtomic: "9007199254740993000000000000000001", memo: '<img src=x onerror="alert(1)">',
  appliedDefaults: [{ field: "issueDate", value: "2026-09-06", source: "workspace_date" }, { field: "dueDate", value: "2026-10-06", source: "sender_terms" }, { field: "payableUntil", value: "2026-11-05T00:00:00Z", source: "technical_deadline" }],
};
const invoice: InvoiceSummary = {
  id, invoiceNumber: null, version: 2, clientName: "North Studio", amountDecimal: snapshot.amountDecimal, amountAtomic: snapshot.amountAtomic,
  issueDate: snapshot.issueDate, dueDate: snapshot.dueDate, payableUntil: snapshot.payableUntil,
  commercialState: "draft", paymentStatus: "unpaid", displayStatus: "Draft", updatedAt: "2026-09-06T12:00:00Z",
};
const detail: InvoiceDetail = {
  invoice, version: { id, draftId: id, version: 2, snapshot, createdAt: invoice.updatedAt },
  history: [{ id, version: 2, createdAt: invoice.updatedAt }, { id: "previous", version: 1, createdAt: "2026-09-05T12:00:00Z" }],
};
const overview: InvoiceOverview = {
  senderComplete: false, clientCount: 0, activeConnectorCount: 0, invoiceCount: 1, draftCount: 1,
  receivablesAtomic: "0", attention: [invoice], latestSettlement: null,
};
const repository = { listInvoices: vi.fn(), getInvoiceDetail: vi.fn(), getOverview: vi.fn() };
const pages = [
  { name: "overview", render: () => OverviewPage() },
  { name: "ledger", render: () => InvoicesPage({ searchParams: Promise.resolve({}) }) },
  { name: "detail", render: () => InvoicePage({ params: Promise.resolve({ id }) }) },
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDashboardSession).mockResolvedValue(identity);
  vi.mocked(getDraftRepository).mockReturnValue(repository as unknown as DraftRepository);
  repository.getOverview.mockResolvedValue(structuredClone(overview));
  repository.listInvoices.mockResolvedValue({ items: [invoice], hasMore: false });
  repository.getInvoiceDetail.mockResolvedValue(structuredClone(detail));
});
afterEach(cleanup);

it.each(pages)("$name independently rejects a missing session before repository creation", async ({ render: page }) => {
  vi.mocked(getDashboardSession).mockResolvedValue(null);
  await expect(page()).rejects.toThrow("redirect:/login");
  expect(getDraftRepository).not.toHaveBeenCalled();
});

it("renders actual setup and draft attention without counting draft value as receivables or inventing settlement", async () => {
  render(await OverviewPage());
  expect(repository.getOverview).toHaveBeenCalledExactlyOnceWith(actor);
  expect(screen.getByRole("heading", { name: "Prepare your workspace" })).toBeDefined();
  expect(screen.getByTestId("receivables").textContent).toBe("0 USDC");
  expect(screen.getByRole("heading", { name: "Needs attention" })).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Latest settlement" })).toBeNull();
  expect(screen.getByText(/MCP is not available yet/)).toBeDefined();
});

it("removes completed setup and displays only real settlement evidence and the repository's attention order", async () => {
  repository.getOverview.mockResolvedValue({ ...overview, senderComplete: true, clientCount: 2, activeConnectorCount: 1,
    receivablesAtomic: "1000000000000000001", attention: [{ ...invoice, id: "second", invoiceNumber: "INV-002", commercialState: "expired" }, invoice],
    latestSettlement: { invoiceId: id, invoiceNumber: "INV-001", amountDecimal: "1.000000000000000001", transactionHash: `0x${"a".repeat(64)}`, blockTime: invoice.updatedAt },
  });
  render(await OverviewPage());
  expect(screen.queryByRole("heading", { name: "Prepare your workspace" })).toBeNull();
  expect(screen.getByTestId("receivables").textContent).toBe("1.000000000000000001 USDC");
  expect(screen.getByRole("heading", { name: "Latest settlement" })).toBeDefined();
  expect(screen.getByText(`0x${"a".repeat(64)}`)).toBeDefined();
  expect(within(screen.getByRole("list", { name: "Invoice attention" })).getAllByRole("link")[0].textContent).toContain("INV-002");
});

it("server renders a single GET toolbar, exact amounts, separate states and bounded pagination", async () => {
  repository.listInvoices.mockResolvedValue({ items: [{ ...invoice, commercialState: "voided", paymentStatus: "paid", displayStatus: "Paid" }], hasMore: true });
  const result = await InvoicesPage({ searchParams: Promise.resolve({ search: "North", state: "voided", offset: "50" }) });
  const html = renderToStaticMarkup(result);
  expect(html).toContain(snapshot.amountDecimal);
  render(result);
  expect(repository.listInvoices).toHaveBeenCalledExactlyOnceWith(actor, { search: "North", commercialState: "voided", offset: 50, limit: 50 });
  expect(screen.getByRole("search").getAttribute("method")).toBe("get");
  expect(document.querySelectorAll("form")).toHaveLength(1);
  expect(screen.getByRole("columnheader", { name: "Commercial state" })).toBeDefined();
  expect(screen.getByRole("columnheader", { name: "Payment" })).toBeDefined();
  expect(screen.getByRole("cell", { name: "Voided" })).toBeDefined();
  expect(screen.getByRole("cell", { name: "Paid" })).toBeDefined();
  expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toContain("search=North&state=voided&offset=100");
  expect(screen.getByRole("link", { name: "Previous page" }).getAttribute("href")).toContain("offset=0");
});

it("rejects malformed filters without DB access and offers a clean ledger link", async () => {
  render(await InvoicesPage({ searchParams: Promise.resolve({ state: ["draft", "published"] }) }));
  expect(getDraftRepository).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("Invalid invoice filters");
  expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/app/invoices");
});

it("distinguishes an empty ledger from no search results and never generates pagination above the bound", async () => {
  repository.listInvoices.mockResolvedValue({ items: [], hasMore: true });
  render(await InvoicesPage({ searchParams: Promise.resolve({ offset: "10000", search: "missing" }) }));
  expect(screen.getByRole("heading", { name: "No matching invoices" })).toBeDefined();
  expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
  cleanup();
  repository.listInvoices.mockResolvedValue({ items: [], hasMore: false });
  render(await InvoicesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "No invoices yet" })).toBeDefined();
});

it("renders immutable snapshot facts, defaults, provenance, pending changes and version history as escaped text", async () => {
  const result = await InvoicePage({ params: Promise.resolve({ id }) });
  const html = renderToStaticMarkup(result);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  render(result);
  expect(repository.getInvoiceDetail).toHaveBeenCalledExactlyOnceWith(actor, id);
  expect(screen.getByText("Immutable sender")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Applied defaults" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Client provenance" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Pending client changes" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Version history" })).toBeDefined();
  expect(screen.getByText("Version 1")).toBeDefined();
  expect(screen.getAllByText("https://example.com/billing").length).toBeGreaterThan(0);
  expect(document.querySelectorAll("script, img, form, a[href*='example.com'], a[href*='/pay/'], a[href*='/receipt/']")).toHaveLength(0);
  expect(screen.queryByRole("button")).toBeNull();
});

it("handles legacy records without inventing an immutable snapshot", async () => {
  repository.getInvoiceDetail.mockResolvedValue({ ...detail, invoice: { ...invoice, clientName: null, amountDecimal: null }, version: null });
  render(await InvoicePage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText(/No draft snapshot is available for this legacy record/)).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Applied defaults" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Version history" })).toBeDefined();
});

it("shows pending client creation with no saved reference, defaults, memo or history safely", async () => {
  const newClientSnapshot: DraftSnapshot = {
    ...snapshot, memo: "", appliedDefaults: [], clientReference: { id: null, alias: null, revision: null },
    sender: { ...snapshot.sender, defaultPaymentTermsDays: null },
    proposedClientChanges: { kind: "create", fields: { billingAddress: { value: address, provenance: { kind: "user_provided" }, confirmed: true } } },
  };
  repository.getInvoiceDetail.mockResolvedValue({ ...detail, version: { ...detail.version!, snapshot: newClientSnapshot }, history: [] });
  render(await InvoicePage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText("No defaults were applied to this version.")).toBeDefined();
  expect(screen.getByText("No memo provided.")).toBeDefined();
  expect(screen.getByText("No version history is available.")).toBeDefined();
  expect(screen.getByText(/Create a client profile with these confirmed fields/)).toBeDefined();
  expect(screen.getByText("Not assigned")).toBeDefined();
});

it("renders a legacy ledger row with null facts without fabricating amounts or dates", async () => {
  repository.listInvoices.mockResolvedValue({ items: [{ ...invoice, invoiceNumber: "INV-LEGACY", clientName: null, amountDecimal: null, dueDate: null, commercialState: "expired" }], hasMore: false });
  render(await InvoicesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "INV-LEGACY" })).toBeDefined();
  expect(screen.getByText("Client unavailable")).toBeDefined();
  expect(screen.getAllByRole("cell", { name: "Unavailable" })).toHaveLength(2);
  expect(screen.getByRole("cell", { name: "Expired" })).toBeDefined();
  expect(screen.getByRole("cell", { name: "Unpaid" })).toBeDefined();
});

it("shows no pending diff when the snapshot uses the saved client without proposals", async () => {
  repository.getInvoiceDetail.mockResolvedValue({ ...detail, version: { ...detail.version!, snapshot: { ...snapshot, proposedClientChanges: { kind: "none", fields: {} } } } });
  render(await InvoicePage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText("No pending client-profile changes.")).toBeDefined();
  expect(screen.queryByText(/No client profile has been changed by this draft/)).toBeNull();
});

it("returns not found for malformed, missing or foreign records", async () => {
  await expect(InvoicePage({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not-found");
  expect(getDraftRepository).not.toHaveBeenCalled();
  repository.getInvoiceDetail.mockResolvedValue(null);
  await expect(InvoicePage({ params: Promise.resolve({ id }) })).rejects.toThrow("not-found");
  repository.getInvoiceDetail.mockRejectedValue(new DraftError("NOT_FOUND", 404));
  await expect(InvoicePage({ params: Promise.resolve({ id }) })).rejects.toThrow("not-found");
});

it.each(pages)("$name never renders provider failure text or a false empty state", async ({ render: page }) => {
  for (const read of Object.values(repository)) read.mockRejectedValue(new Error("PRIVATE_PROVIDER"));
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("could not load");
  expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER");
  expect(screen.queryByText("No invoices yet")).toBeNull();
});

// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { testPublicationSnapshot } from "../../../lib/invoices/publication.test-support";
import { canonicalPublicationJson } from "../../../lib/invoices/publication-links";
import type { PublicationAttempt } from "../../../lib/invoices/publication-contracts";
import InvoicePage from "./page";

const mocks = vi.hoisted(() => ({ runtime: vi.fn(), resolve: vi.fn(), parse: vi.fn(), view: vi.fn(), qr: vi.fn() }));
vi.mock("../../../lib/documents/runtime", () => ({ createDocumentRuntime: mocks.runtime }));
vi.mock("../../../lib/documents/invoice-view", () => ({ parseCanonicalInvoiceDocument: mocks.parse, buildPublishedInvoiceView: mocks.view }));
vi.mock("../../../lib/documents/invoice-pdf", () => ({ invoiceQrDataUrl: mocks.qr }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); });

it("revalidates independently, uses the shared formatter/QR, and sends only precise document DTO props", async () => {
  const attempt = {
    invoiceId: "internal-invoice", invoiceVersion: 1, invoiceNumber: "INV-2030-000001", invoiceKey: `0x${"1".repeat(64)}`,
    chainId: 5042002, contractAddress: `0x${"2".repeat(40)}`, snapshot: testPublicationSnapshot(),
    publicationSalt: "secret-salt", storageKey: "secret-storage", artifact: { pdfContentHash: "pdf-hash", documentCommitment: "commitment" },
  } as unknown as PublicationAttempt;
  attempt.artifact!.invoiceDataHash = keccak256(toHex(canonicalPublicationJson(attempt)));
  mocks.resolve.mockResolvedValue({ invoiceId: attempt.invoiceId, invoiceVersion: 1, invoiceNumber: attempt.invoiceNumber,
    commercialState: "published", payableUntil: "2000-01-01T00:00:00Z", voidedAt: null, settlement: null,
    attempt, deliveries: [{ normalizedRecipient: "private-delivery" }] });
  mocks.runtime.mockReturnValue({ access: { resolve: mocks.resolve }, config: { appOrigin: "https://configured.test" } });
  mocks.parse.mockReturnValue({ parsed: true });
  mocks.view.mockReturnValue({ invoiceNumber: attempt.invoiceNumber });
  mocks.qr.mockResolvedValue("data:image/png;base64,inert");
  const result = await InvoicePage({ params: Promise.resolve({ slug: "inert" }) });
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith("inert");
  expect(mocks.view).toHaveBeenCalledExactlyOnceWith({ parsed: true }, "https://configured.test/invoice/inert");
  expect(mocks.qr).toHaveBeenCalledExactlyOnceWith("https://configured.test/invoice/inert");
  expect(result.props).toEqual({ view: { invoiceNumber: attempt.invoiceNumber }, qrDataUrl: "data:image/png;base64,inert",
    pdfContentHash: "pdf-hash", documentCommitment: "commitment", commercialState: "expired", paymentStatus: "unpaid", displayStatus: "Expired" });
});

it("does not render invoice facts when the target disappears after Proxy admission", async () => {
  mocks.runtime.mockReturnValue({ access: { resolve: mocks.resolve } });
  mocks.resolve.mockResolvedValue(null);
  await expect(InvoicePage({ params: Promise.resolve({ slug: "inert" }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.view).not.toHaveBeenCalled();
});

it("sends late operational failures to the credential-free 503 boundary instead of throwing provider details", async () => {
  mocks.runtime.mockImplementation(() => { throw new Error("private-provider-details"); });
  await expect(InvoicePage({ params: Promise.resolve({ slug: "inert" }) })).rejects.toThrow("REDIRECT:/invoice/system/unavailable");
});

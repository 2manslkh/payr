// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublishedInvoiceView, StoredDocument } from "./contracts";
import { DocumentUnavailableError, DocumentVerificationError } from "./contracts";
import { createInvoiceDocumentPort, createPrivateDocumentStorage } from "./invoice-storage";

// Approved producer seams are mocked here, not real PDF evidence. T01 supplies the implementations.
const producer = vi.hoisted(() => ({ parse: vi.fn(), view: vi.fn(), render: vi.fn(), inspect: vi.fn(), commitment: vi.fn() }));
vi.mock("/src/lib/documents/invoice-view", () => ({ parseCanonicalInvoiceDocument: producer.parse, buildPublishedInvoiceView: producer.view }));
vi.mock("/src/lib/documents/invoice-pdf", () => ({ renderInvoicePdf: producer.render }));
vi.mock("/src/lib/documents/pdf-verification", () => ({ inspectInvoicePdf: producer.inspect }));
vi.mock("/src/lib/domain/commitment", () => ({ computeDocumentCommitment: producer.commitment }));

const id = "00000000-0000-4000-8000-000000000001";
const document = { schemaVersion: "payr.invoice-document.v1", invoiceId: id, invoiceVersion: 1,
  invoiceNumber: "INV-2026-000001", invoiceKey: `0x${"1".repeat(64)}`, chainId: 5042002,
  contractAddress: `0x${"3".repeat(40)}`, invoice: testPublicationSnapshot() };
const input = { storageKey: `workspace/${id}/invoice/${id}/1/attempt/${id}.pdf`, canonicalInvoiceJson: canonicalJson(document),
  invoiceNumber: document.invoiceNumber, invoiceUrl: "https://example.test/invoice/test-only-destination", publicationSalt: `0x${"4".repeat(64)}` as const };
const view: PublishedInvoiceView = { invoiceNumber: input.invoiceNumber, invoiceVersion: 1, issueDate: "2030-01-01", dueDate: "2030-01-31",
  payableUntil: "2030-03-02T00:00:00.000Z", sender: { businessName: "Test & Studio", contactName: "Owner", contactEmail: "owner@example.test", addressLines: ["1 Test Road", "London", "N1 1AA", "United Kingdom"] },
  client: { businessName: "Test Client", contactName: "Client", contactEmail: "client@example.test", addressLines: ["1 Test Road", "London", "N1 1AA", "United Kingdom"] },
  items: document.invoice.items, amountDecimal: "1.23", amountAtomic: "1230000000000000000", memo: "", payoutWallet: document.invoice.sender.payoutWallet,
  asset: "USDC", network: "Arc", invoiceUrl: input.invoiceUrl };
const text = [view.invoiceNumber, view.invoiceVersion, view.issueDate, view.dueDate, view.payableUntil,
  ...Object.values(view.sender).flat(), ...Object.values(view.client).flat(), "Confirmed work", "1.23", view.payoutWallet,
  view.asset, view.network, view.invoiceUrl].join(" ");
const proof = { invoiceDataHash: `0x${"5".repeat(64)}`, pdfContentHash: `0x${"6".repeat(64)}`, documentCommitment: `0x${"7".repeat(64)}` };
const object = (label: string): StoredDocument => {
  const bytes = new TextEncoder().encode(`%PDF-1.7\nmocked producer bytes: ${label}`);
  return { bytes, contentType: "application/pdf", byteLength: bytes.length };
};

beforeEach(() => {
  vi.resetAllMocks();
  producer.parse.mockReturnValue(document); producer.view.mockReturnValue(view);
  producer.render.mockResolvedValue(object("loser").bytes);
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text });
  producer.commitment.mockReturnValue(proof);
});

it("reads and verifies the downloaded collision winner rather than the rendered upload bytes", async () => {
  const winner = object("winner"), read = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(winner);
  const create = vi.fn().mockResolvedValue("exists"), storageState = vi.fn().mockResolvedValue("rendering");
  const result = await createInvoiceDocumentPort({ read, create }, { storageState }).createOrRead(input);
  expect(result).toEqual({ ...winner, ...proof, decodedQrDestination: input.invoiceUrl });
  expect(read.mock.invocationCallOrder[0]).toBeLessThan(storageState.mock.invocationCallOrder[0]);
  expect(create).toHaveBeenCalledWith(input.storageKey, object("loser").bytes);
  expect(producer.inspect).toHaveBeenCalledWith(winner.bytes);
  expect(producer.commitment).toHaveBeenCalledWith(input.canonicalInvoiceJson, winner.bytes, input.publicationSalt);
});

it.each(["reserved", "rendering", "stored", "finalized"])("reuses an existing %s object without rendering or uploading", async (state) => {
  const winner = object("winner"), read = vi.fn().mockResolvedValue(winner), create = vi.fn();
  const result = await createInvoiceDocumentPort({ read, create }, { storageState: vi.fn().mockResolvedValue(state) }).createOrRead(input);
  expect(result.bytes).toEqual(winner.bytes);
  expect(create).not.toHaveBeenCalled(); expect(producer.render).not.toHaveBeenCalled();
});

it.each(["stored", "finalized", "failed", null])("never regenerates a missing %s object", async (state) => {
  const create = vi.fn();
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(null), create },
    { storageState: vi.fn().mockResolvedValue(state) }).createOrRead(input)).rejects.toEqual(new DocumentUnavailableError());
  expect(create).not.toHaveBeenCalled(); expect(producer.render).not.toHaveBeenCalled();
});

it("retries an ambiguous upload response by reading the winner, never deleting or overwriting", async () => {
  const winner = object("winner");
  const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(winner);
  const create = vi.fn().mockRejectedValue(new Error("private storage response"));
  const port = createInvoiceDocumentPort({ read, create }, { storageState: vi.fn().mockResolvedValue("rendering") });
  await expect(port.createOrRead(input)).rejects.toEqual(new DocumentUnavailableError());
  expect((await port.createOrRead(input)).bytes).toEqual(winner.bytes);
  expect(create).toHaveBeenCalledTimes(1); expect(producer.render).toHaveBeenCalledTimes(1);
});

it.each(["stored", "finalized", "failed"])("does not upload when rendering finishes after the attempt becomes %s", async (state) => {
  const read = vi.fn().mockResolvedValue(null), create = vi.fn();
  const storageState = vi.fn().mockResolvedValueOnce("rendering").mockResolvedValue(state);
  await expect(createInvoiceDocumentPort({ read, create }, { storageState }).createOrRead(input)).rejects.toEqual(new DocumentUnavailableError());
  expect(create).not.toHaveBeenCalled();
});

it.each([{ qrDestinations: [] }, { qrDestinations: ["https://example.test/wrong"] }, { qrDestinations: [input.invoiceUrl, input.invoiceUrl] }])("rejects missing, wrong or multiple decoded QR destinations %j", async ({ qrDestinations }) => {
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations, text });
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("winner")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
  expect(producer.commitment).not.toHaveBeenCalled();
});

it("rejects another invoice's material text even if its QR matches", async () => {
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text: text.replace("Test & Studio", "Wrong Issuer") });
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("wrong invoice")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
});

it.each(["mime", "length", "magic", "oversize", "inspection"])("treats invalid %s proof as terminal", async (kind) => {
  const stored = object("invalid");
  if (kind === "mime") stored.contentType = "text/plain";
  if (kind === "length") stored.byteLength++;
  if (kind === "magic") stored.bytes[0] = 0;
  if (kind === "oversize") { stored.bytes = new Uint8Array(10485761); stored.byteLength = stored.bytes.length; }
  if (kind === "inspection") producer.inspect.mockRejectedValue(new DocumentVerificationError());
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(stored), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
});

it.each(["read", "state", "readback"])("sanitizes %s transport errors without creating on unconfirmed absence", async (stage) => {
  const create = vi.fn().mockResolvedValue("created"), read = vi.fn().mockResolvedValue(null), storageState = vi.fn().mockResolvedValue("rendering");
  if (stage === "read") read.mockRejectedValue(new Error("private provider detail"));
  if (stage === "state") storageState.mockRejectedValue(new Error("private provider detail"));
  if (stage === "readback") read.mockResolvedValueOnce(null).mockRejectedValue(new Error("private provider detail"));
  await expect(createInvoiceDocumentPort({ read, create }, { storageState }).createOrRead(input)).rejects.toEqual(new DocumentUnavailableError());
  expect(create).toHaveBeenCalledTimes(stage === "readback" ? 1 : 0);
});

it.each(["../invoice.pdf", input.storageKey + "?token=secret", input.storageKey.replace("/1/", "/01/"),
  input.storageKey.replace("/1/", "/2147483648/"), input.storageKey.replace("/attempt/", "/../"),
  input.storageKey.replace("workspace/", "documents/"), input.storageKey.replaceAll(id, "ffffffff-ffff-9fff-8fff-ffffffffffff")])(
  "rejects unsafe object paths before any storage I/O: %s", async (key) => {
    const from = vi.fn(), storage = createPrivateDocumentStorage({ storage: { from } } as unknown as SupabaseClient);
    await expect(storage.read(key)).rejects.toEqual(new DocumentVerificationError());
    await expect(storage.create(key, object("test").bytes)).rejects.toEqual(new DocumentVerificationError());
    expect(from).not.toHaveBeenCalled();
  });

it("allows only explicit missing-object errors and create-only PDF uploads in the documents bucket", async () => {
  const download = vi.fn().mockResolvedValue({ data: null, error: { statusCode: "404", message: "Object not found" } });
  const upload = vi.fn().mockResolvedValue({ data: { path: input.storageKey }, error: null });
  const from = vi.fn().mockReturnValue({ download, upload });
  const storage = createPrivateDocumentStorage({ storage: { from } } as unknown as SupabaseClient);
  expect(await storage.read(input.storageKey)).toBeNull();
  expect(await storage.create(input.storageKey, object("upload").bytes)).toBe("created");
  expect(from.mock.calls).toEqual([["documents"], ["documents"]]);
  expect(upload).toHaveBeenCalledWith(input.storageKey, object("upload").bytes, { contentType: "application/pdf", upsert: false });
  download.mockResolvedValue({ data: null, error: { statusCode: "404", message: "Gateway unavailable" } });
  await expect(storage.read(input.storageKey)).rejects.toEqual(new DocumentUnavailableError());
  upload.mockResolvedValue({ data: null, error: { statusCode: "409", message: "Duplicate" } });
  expect(await storage.create(input.storageKey, object("loser").bytes)).toBe("exists");
});

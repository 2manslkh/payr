// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PdfTextItem, PublishedInvoiceView, StoredDocument } from "./contracts";
import { DocumentUnavailableError, DocumentVerificationError } from "./contracts";
import { createInvoiceDocumentPort, createPrivateDocumentStorage } from "./invoice-storage";

// Producer seams are mocked for recovery tests; invoice-storage.pdf.test.ts verifies real PDFs.
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
const text = `Payr Invoice INV-2026-000001 Version 1
From Test & Studio 1 Test Road London N1 1AA United Kingdom Owner owner@example.test
Bill to Test Client 1 Test Road London N1 1AA United Kingdom Client client@example.test
Issue date 2030-01-01 Due date 2030-01-31 Technical payable deadline (UTC) 2030-03-02T00:00:00.000Z
Description Amount (USDC)
1 Confirmed work Line amount: 1.23 USDC Atomic units: 1230000000000000000 atomic units
Total due 1.23 USDC Atomic units: 1230000000000000000 atomic units
Payment destination 0x2222222222222222222222222222222222222222 USDC on Arc
Open the protected invoice page to review and pay. https://example.test/invoice/test-only-destination
Commercial invoice / payment request | Page 1 of 1`;
const textItems: PdfTextItem[] = [
  { page: 1, text: "1", x: 42, y: 346.4, width: 3.892, height: 7 },
  { page: 1, text: "Confirmed work", x: 56.14, y: 349.1, width: 70.31, height: 10 },
  { page: 1, text: "Line amount: 1.23 USDC", x: 442.62, y: 349.1, width: 110.66, height: 10 },
  { page: 1, text: "Atomic units: 1230000000000000000 atomic units", x: 398.377, y: 357.4, width: 154.903, height: 7 },
  { page: 1, text: "Total due", x: 516.839, y: 393.9, width: 36.441, height: 9 },
  { page: 1, text: "1.23 USDC", x: 452.14, y: 417.7, width: 101.14, height: 20 },
  { page: 1, text: "Atomic units: 1230000000000000000 atomic units", x: 398.377, y: 428, width: 154.903, height: 7 },
  { page: 1, text: "Payment destination", x: 42, y: 488.5, width: 80.91, height: 9 },
];
const proof = { invoiceDataHash: `0x${"5".repeat(64)}`, pdfContentHash: `0x${"6".repeat(64)}`, documentCommitment: `0x${"7".repeat(64)}` };
const object = (label: string): StoredDocument => {
  const bytes = new TextEncoder().encode(`%PDF-1.7\nmocked producer bytes: ${label}`);
  return { bytes, contentType: "application/pdf", byteLength: bytes.length };
};

beforeEach(() => {
  vi.resetAllMocks();
  producer.parse.mockReturnValue(document); producer.view.mockReturnValue(view);
  producer.render.mockResolvedValue(object("loser").bytes);
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text, textItems });
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
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations, text, textItems });
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("winner")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
  expect(producer.commitment).not.toHaveBeenCalled();
});

it("rejects another invoice's material text even if its QR matches", async () => {
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], textItems, text: text.replace("Test & Studio", "Wrong Issuer") });
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("wrong invoice")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
});

it.each([
  text.replace("Page 1 of 1", "Page 2 of 1"),
  text.replace("Page 1 of 1", "Page 1 of 2"),
  text.replace("Page 1 of 1", "Page 01 of 1"),
  text.replace(/\nCommercial invoice.*$/, ""),
  text + "\nCommercial invoice / payment request | Page 1 of 1",
  text.replace("Total due", "Other total"),
])("rejects missing, duplicated or inconsistent footer/field labels %#", async (text) => {
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text, textItems });
  await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("invalid layout")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
});

it("normalizes layout whitespace within complete decimal and atomic values", async () => {
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], textItems,
    text: text.replaceAll("1.23", "1. 2\n3").replaceAll("1230000000000000000", "123000000\n0000000000") });
  const stored = object("wrapped amounts");
  const result = await createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(stored), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input);
  expect(result.bytes).toBe(stored.bytes);
});

it.each(["description column", "before the row", "after the total", "outside the right margin", "another page", "wrong font"])(
  "rejects unchanged flattened text whose line money geometry is in %s", async (change) => {
    const measured = structuredClone(textItems), money = measured[2];
    if (change === "description column") money.x = 56.14;
    if (change === "before the row") money.y = 300;
    if (change === "after the total") money.y = 430;
    if (change === "outside the right margin") money.width += 5;
    if (change === "another page") money.page = 2;
    if (change === "wrong font") money.height = 7;
    producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text, textItems: measured });
    await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("misplaced money")), create: vi.fn() },
      { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
  },
);

it.each(["decimal", "atomic"])("rejects swapped %s row observations while all flattened text stays unchanged", async (kind) => {
  const multi = structuredClone(view);
  multi.items.push({ description: "Review work", amountDecimal: "2.34", amountAtomic: "2340000000000000000" });
  multi.amountDecimal = "3.57"; multi.amountAtomic = "3570000000000000000";
  const canonical = { ...document, invoice: { ...document.invoice, items: multi.items,
    amountDecimal: multi.amountDecimal, amountAtomic: multi.amountAtomic } };
  producer.parse.mockReturnValue(canonical); producer.view.mockReturnValue(multi);
  const multiText = text.replace("\nTotal due", "\n2 Review work Line amount: 2.34 USDC Atomic units: 2340000000000000000 atomic units\nTotal due")
    .replace("Total due 1.23 USDC Atomic units: 1230000000000000000", "Total due 3.57 USDC Atomic units: 3570000000000000000");
  const measured: PdfTextItem[] = [
    ...structuredClone(textItems.slice(0, 4)),
    { page: 1, text: "2", x: 42, y: 390, width: 3.892, height: 7 },
    { page: 1, text: "Review work", x: 56.14, y: 392.7, width: 60, height: 10 },
    { ...textItems[2], text: "Line amount: 2.34 USDC", y: 392.7 },
    { ...textItems[3], text: "Atomic units: 2340000000000000000 atomic units", y: 401 },
    { ...textItems[4], y: 440 },
    { ...textItems[5], text: "3.57 USDC", y: 464 },
    { ...textItems[6], text: "Atomic units: 3570000000000000000 atomic units", y: 475 },
    { ...textItems[7], y: 520 },
  ];
  producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text: multiText, textItems: measured });
  const port = createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("two rows")), create: vi.fn() },
    { storageState: vi.fn().mockResolvedValue("stored") });
  const request = { ...input, canonicalInvoiceJson: canonicalJson(canonical) };
  await expect(port.createOrRead(request)).resolves.toMatchObject({ decodedQrDestination: input.invoiceUrl });
  const first = kind === "decimal" ? 2 : 3, second = kind === "decimal" ? 6 : 7;
  [measured[first].y, measured[second].y] = [measured[second].y, measured[first].y];
  await expect(port.createOrRead(request)).rejects.toEqual(new DocumentVerificationError());
});

it.each(["atomic in the description column", "decimal in a row", "decimal after payment", "decimal as memo text", "duplicate total marker"])(
  "rejects unchanged text with invalid total geometry: %s", async (kind) => {
    const measured = structuredClone(textItems);
    if (kind === "atomic in the description column") measured[6].x = 56.14;
    if (kind === "decimal in a row") measured[5].y = 350;
    if (kind === "decimal after payment") measured[5].y = 520;
    if (kind === "decimal as memo text") measured[5].height = 10;
    if (kind === "duplicate total marker") measured.push({ ...measured[4], y: 400 });
    producer.inspect.mockResolvedValue({ pageCount: 1, qrDestinations: [input.invoiceUrl], text, textItems: measured });
    await expect(createInvoiceDocumentPort({ read: vi.fn().mockResolvedValue(object("invalid total")), create: vi.fn() },
      { storageState: vi.fn().mockResolvedValue("stored") }).createOrRead(input)).rejects.toEqual(new DocumentVerificationError());
  },
);

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

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { DocumentVerificationError } from "./contracts";
import { createInvoiceDocumentPort, createPrivateDocumentStorage } from "./invoice-storage";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const key = () => `workspace/${randomUUID()}/invoice/${randomUUID()}/1/attempt/${randomUUID()}.pdf`;
const storage = createPrivateDocumentStorage(service);
// Transport-only fixtures deliberately are not valid PDFs and never stand in for raster/QR evidence.
const bytes = (label: string) => new TextEncoder().encode(`%PDF-1.7\nNot a real PDF: ${label}`);

it("uses real private Storage create-only collision semantics and reads the winning bytes and MIME", async () => {
  const path = key(), first = bytes("first"), second = bytes("second");
  expect(await storage.read(path)).toBeNull();
  expect(await storage.create(path, first)).toBe("created");
  expect(await storage.create(path, second)).toBe("exists");
  expect(await storage.read(path)).toEqual({ bytes: first, byteLength: first.length, contentType: "application/pdf" });
  for (let round = 0; round < 12; round++) {
    const raced = key();
    const results = await Promise.all([storage.create(raced, first), storage.create(raced, second)]);
    expect([...results].sort()).toEqual(["created", "exists"]);
    expect((await storage.read(raced))!.bytes).toEqual(results[0] === "created" ? first : second);
  }
});

it("rejects invalid paths and non-PDF envelopes before uploading", async () => {
  for (const path of ["../invoice.pdf", key() + "?bearer=invalid", key().replace("/1/", "/0/")]) {
    await expect(storage.create(path, bytes("path"))).rejects.toEqual(new DocumentVerificationError());
    await expect(storage.read(path)).rejects.toEqual(new DocumentVerificationError());
  }
  await expect(storage.create(key(), new Uint8Array([1, 2, 3]))).rejects.toEqual(new DocumentVerificationError());
});

it("denies anonymous and authenticated listing, object downloads, public GET and uploads without disclosing objects", async () => {
  const path = key();
  await storage.create(path, bytes("private"));
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `document-${randomUUID()}@example.test`, password = randomUUID();
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  try {
    const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const login = await authenticated.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    for (const client of [anon, authenticated]) {
      const listed = await client.storage.from("documents").list(path.slice(0, path.lastIndexOf("/")));
      expect(listed.error !== null || listed.data?.length === 0).toBe(true);
      const downloaded = await client.storage.from("documents").download(path);
      expect(downloaded.error).not.toBeNull(); expect(downloaded.data).toBeNull();
      const uploaded = await client.storage.from("documents").upload(key(), bytes("denied"), { contentType: "application/pdf", upsert: false });
      expect(uploaded.error).not.toBeNull(); expect(uploaded.data).toBeNull();
    }
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${path}`);
    expect(response.ok).toBe(false);
    expect(await response.text()).not.toContain("Not a real PDF");
  } finally { if (data.user) await service.auth.admin.deleteUser(data.user.id); }
});

it(
  "verifies a real rendered, downloaded PDF and raster-decoded QR, and rejects malformed collisions", async () => {
    const { buildPublishedInvoiceView } = await import("./invoice-view");
    const { renderInvoicePdf } = await import("./invoice-pdf");
    const { inspectInvoicePdf } = await import("./pdf-verification");
    const { computeDocumentCommitment } = await import("../domain/commitment");
    const invoiceId = randomUUID(), workspaceId = randomUUID();
    const document = { schemaVersion: "payr.invoice-document.v1" as const, invoiceId, invoiceVersion: 1,
      invoiceNumber: "INV-2026-000001", invoiceKey: `0x${"1".repeat(64)}` as const, chainId: 5042002,
      contractAddress: `0x${"3".repeat(40)}` as const, invoice: testPublicationSnapshot() };
    const input = { storageKey: `workspace/${workspaceId}/invoice/${invoiceId}/1/attempt/${randomUUID()}.pdf`,
      canonicalInvoiceJson: canonicalJson(document), invoiceNumber: document.invoiceNumber,
      invoiceUrl: "https://example.test/invoice/noncredential-rendering-fixture", publicationSalt: `0x${"4".repeat(64)}` as const };
    const port = createInvoiceDocumentPort(storage, { storageState: async () => "rendering" });
    const result = await port.createOrRead(input);
    const downloaded = (await storage.read(input.storageKey))!;
    expect(result.bytes).toEqual(downloaded.bytes);
    expect(await inspectInvoicePdf(downloaded.bytes)).toMatchObject({ qrDestinations: [input.invoiceUrl] });
    expect(result).toMatchObject(computeDocumentCommitment(input.canonicalInvoiceJson, downloaded.bytes, input.publicationSalt));
    expect(await port.createOrRead(input)).toEqual(result);
    const wrongKey = input.storageKey.replace(/attempt\/.*$/, `attempt/${randomUUID()}.pdf`);
    const wrongView = buildPublishedInvoiceView(document, "https://example.test/invoice/wrong-destination");
    await storage.create(wrongKey, await renderInvoicePdf(wrongView));
    await expect(port.createOrRead({ ...input, storageKey: wrongKey })).rejects.toEqual(new DocumentVerificationError());
    const falseKey = input.storageKey.replace(/attempt\/.*$/, `attempt/${randomUUID()}.pdf`);
    const falseView = buildPublishedInvoiceView(document, input.invoiceUrl);
    falseView.sender.businessName = "Wrong Issuer";
    await storage.create(falseKey, await renderInvoicePdf(falseView));
    await expect(port.createOrRead({ ...input, storageKey: falseKey })).rejects.toEqual(new DocumentVerificationError());
    const malformedKey = input.storageKey.replace(/attempt\/.*$/, `attempt/${randomUUID()}.pdf`);
    await storage.create(malformedKey, bytes("not a real PDF"));
    await expect(port.createOrRead({ ...input, storageKey: malformedKey })).rejects.toEqual(new DocumentVerificationError());
  }, 120000,
);

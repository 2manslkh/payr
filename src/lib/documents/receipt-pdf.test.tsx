// @vitest-environment node
import { expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import { createReceiptDocumentPort } from "./receipt-storage";
import { testReceiptWork } from "../receipts/test-support";
import { publicationLink } from "../invoices/publication-links";
import { inspectInvoicePdf } from "./pdf-verification";

it("creates one immutable receipt with exact settlement facts and a stored-byte decoded receipt QR", async () => {
  const { work, config } = testReceiptWork();
  work.attempt.publicationSalt = `0x${"9".repeat(64)}`;
  work.attempt.link.revokedAt = "2030-01-02T00:01:00Z";
  let bytes: Uint8Array | null = null;
  const storage = { read: vi.fn(async () => bytes ? { bytes, contentType: "application/pdf", byteLength: bytes.byteLength } : null),
    create: vi.fn(async (_key: string, created: Uint8Array) => { bytes = new Uint8Array(created); return "created" as const; }) };
  const documents = createReceiptDocumentPort(storage);
  const artifact = await documents.createOrRead(work, config);
  expect(artifact.pdfContentHash).toBe(keccak256(bytes!));
  const inspection = await inspectInvoicePdf(bytes!);
  expect(inspection.qrDestinations).toEqual([publicationLink(work.link, "receipt-bearer", config)]);
  expect(inspection.text).toContain("Receipt");
  expect(inspection.text).toContain(work.settlement.transactionHash);
  expect(inspection.text).toContain(work.attempt.artifact!.pdfContentHash);
  expect(inspection.text).not.toContain(work.attempt.publicationSalt);
  expect(inspection.text).not.toContain("owner@example.test");
  expect(await documents.createOrRead(work, config)).toEqual(artifact);
  expect(storage.create).toHaveBeenCalledOnce();
}, 30_000);

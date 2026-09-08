// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createReceiptAccessService } from "./access";
import { testReceiptWork } from "./test-support";
import { createKeyedTokenCodec } from "../security/keyed-token";

it("admits only the ready receipt's purpose-bound credential independently of a revoked invoice link", async () => {
  const { work, config } = testReceiptWork();
  work.state = "ready"; work.leaseUntil = null;
  work.artifact = { storageKey: `workspace/${work.workspaceId}/receipt/${work.id}.pdf`, pdfFilename: `receipt-${work.attempt.invoiceNumber}-v1.pdf`,
    contentType: "application/pdf", byteLength: 100, pdfContentHash: work.settlement.documentCommitment, qrVerified: true };
  work.attempt.link.revokedAt = "2030-01-02T00:00:00Z";
  const candidate = { ...work.link, purpose: "receipt-bearer", workspaceId: work.workspaceId, invoiceId: work.invoiceId, invoiceVersionId: work.invoiceVersionId };
  const documents = { findCandidate: vi.fn().mockResolvedValue(candidate), admit: vi.fn().mockResolvedValue({ allowed: true }) };
  const receipts = { read: vi.fn().mockResolvedValue(work) };
  const service = createReceiptAccessService(documents, receipts, { ...config, pepper: new Uint8Array(32).fill(9) }, () => Date.parse("2030-01-02T00:00:00Z"));
  const slug = createKeyedTokenCodec(config.keys).derive(work.link.tokenId, "receipt-bearer", 1).slug;
  expect(await service.resolve(slug, "127.0.0.1")).toEqual(work);
  expect(documents.admit).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(documents.admit.mock.calls)).not.toContain("127.0.0.1");
  candidate.purpose = "invoice-bearer";
  receipts.read.mockClear();
  expect(await service.resolve(slug)).toBeNull();
  expect(receipts.read).not.toHaveBeenCalled();
});

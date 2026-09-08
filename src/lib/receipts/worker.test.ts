// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createReceiptWorker } from "./worker";
import { testReceiptWork } from "./test-support";
import { DocumentUnavailableError, DocumentVerificationError } from "../documents/contracts";

it("marks ready only after the document adapter verifies stored bytes and with the claimed fence", async () => {
  const { work, config } = testReceiptWork();
  const artifact = { storageKey: `workspace/${work.workspaceId}/receipt/${work.id}.pdf`, pdfFilename: "receipt-INV-2030-000001-v1.pdf",
    contentType: "application/pdf" as const, byteLength: 123, pdfContentHash: work.settlement.documentCommitment, qrVerified: true as const };
  const repository = { claim: vi.fn().mockResolvedValue(work), complete: vi.fn().mockResolvedValue(true), fail: vi.fn(), read: vi.fn() };
  const documents = { createOrRead: vi.fn().mockResolvedValue(artifact) };
  expect(await createReceiptWorker(repository, documents, config).run()).toEqual({ outcome: "ready", id: work.id });
  expect(repository.complete).toHaveBeenCalledExactlyOnceWith(work.id, work.fence, artifact);
  expect(documents.createOrRead).toHaveBeenCalledExactlyOnceWith(work, config);
});

it.each([new DocumentVerificationError(), new DocumentUnavailableError()])("fences failure scheduling without declaring unverified bytes ready", async (error) => {
  const { work, config } = testReceiptWork();
  const repository = { claim: vi.fn().mockResolvedValue(work), complete: vi.fn(), fail: vi.fn().mockResolvedValue(true), read: vi.fn() };
  const documents = { createOrRead: vi.fn().mockRejectedValue(error) };
  const result = await createReceiptWorker(repository, documents, config).run();
  expect(result).toEqual({ outcome: error instanceof DocumentVerificationError ? "failed" : "retry_wait", id: work.id });
  expect(repository.complete).not.toHaveBeenCalled();
  expect(repository.fail).toHaveBeenCalledExactlyOnceWith(work.id, work.fence,
    error instanceof DocumentVerificationError ? "ARTIFACT_VERIFICATION_FAILED" : "DOCUMENT_UNAVAILABLE");
});

// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createOutboxWorker } from "./outbox";
import { testReceiptWork } from "../receipts/test-support";
import type { DeliveryWork, OutboxRepository, ReceiptEmailPayload } from "./outbox-contracts";
import { DocumentVerificationError } from "../documents/contracts";
afterEach(() => vi.restoreAllMocks());

function setup() {
  const { work: receipt } = testReceiptWork();
  receipt.state = "ready"; receipt.leaseUntil = null;
  receipt.artifact = { storageKey: `workspace/${receipt.workspaceId}/receipt/${receipt.id}.pdf`, pdfFilename: `receipt-${receipt.attempt.invoiceNumber}-v1.pdf`,
    contentType: "application/pdf", byteLength: 123, pdfContentHash: receipt.settlement.documentCommitment, qrVerified: true };
  const work: DeliveryWork = { id: "00000000-0000-4000-8000-000000000004", workspaceId: receipt.workspaceId,
    settlementId: receipt.settlementId, receiptDocumentId: receipt.id, normalizedRecipient: "client@example.test", roles: ["client"], messageKind: "receipt",
    state: "sending", fence: "1", attemptCount: 1, leaseUntil: "2030-01-02T00:03:00Z", nextAttemptAt: null,
    providerIdempotencyKey: "payr-receipt-test-key", firstProviderAttemptAt: null, providerRequestStartedAt: null,
    ambiguousSince: null, providerMessageId: null, payloadHash: null, lastErrorCode: null, receipt };
  const payload: ReceiptEmailPayload = { from: "Payr <sender@example.test>", to: [work.normalizedRecipient], subject: "Receipt",
    text: "Verified receipt", html: "<p>Verified receipt</p>", attachments: [{ filename: receipt.artifact.pdfFilename, content: "JVBERi0=" }] };
  const prepare = vi.fn().mockResolvedValue(payload);
  const repository = { claim: vi.fn().mockResolvedValue(work),
    begin: vi.fn<OutboxRepository["begin"]>().mockImplementation(async (_id, _fence, payloadHash) => ({ ...work, payloadHash, firstProviderAttemptAt: "2030-01-02T00:00:00Z", providerRequestStartedAt: "2030-01-02T00:00:00Z" })),
    finish: vi.fn().mockResolvedValue({ ...work, state: "sent" }) };
  const provider = { send: vi.fn().mockResolvedValue({ kind: "sent", providerMessageId: "00000000-0000-4000-8000-000000000005" }) };
  return { work, payload, prepare, repository, provider, worker: createOutboxWorker(repository, prepare, provider) };
}

it("prepares immutable content, persists the request marker, then sends with the logical delivery's stable key", async () => {
  const { worker, work, repository, prepare, provider, payload } = setup();
  expect(await worker.run()).toEqual({ outcome: "sent", id: work.id });
  expect(prepare).toHaveBeenCalledExactlyOnceWith(work);
  expect(repository.begin).toHaveBeenCalledExactlyOnceWith(work.id, work.fence, expect.stringMatching(/^[0-9a-f]{64}$/));
  expect(repository.begin.mock.invocationCallOrder[0]).toBeLessThan(provider.send.mock.invocationCallOrder[0]);
  expect(provider.send).toHaveBeenCalledExactlyOnceWith(payload, work.providerIdempotencyKey, expect.any(Number));
  expect(repository.finish).toHaveBeenCalledExactlyOnceWith(work.id, work.fence,
    { kind: "sent", providerMessageId: "00000000-0000-4000-8000-000000000005" });
});

it.each([[1000, 2000], [32000, 3000]])("charges marker response latency before an ambiguous retry (%s ms remaining, %s ms response)", async (remaining, delay) => {
  const { worker, work, repository, provider } = setup();
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  repository.begin.mockImplementation(async (_id, _fence, payloadHash) => {
    elapsed = delay;
    return { ...work, payloadHash, firstProviderAttemptAt: "2030-01-01T00:00:00Z",
      ambiguousSince: "2030-01-01T00:00:00Z", providerRequestStartedAt: new Date(Date.parse("2030-01-02T00:00:00Z") - remaining).toISOString(), leaseUntil: "2030-01-02T00:02:00Z" };
  });
  repository.finish.mockResolvedValue({ ...work, state: "manual_review" });
  expect(await worker.run()).toEqual({ outcome: "manual_review", id: work.id });
  expect(provider.send).not.toHaveBeenCalled();
});

it.each(["idle", "not ready", "prepare failure", "wrong recipient", "lost claim", "manual review", "marker failure"])(
  "does not contact the provider after %s", async (mode) => {
    const { worker, work, payload, prepare, repository, provider } = setup();
    repository.finish.mockResolvedValue({ ...work, state: "retry_wait" });
    if (mode === "idle") repository.claim.mockResolvedValue(null);
    if (mode === "not ready") work.receipt.state = "pending";
    if (mode === "prepare failure") prepare.mockRejectedValue(new Error("Storage down"));
    if (mode === "wrong recipient") payload.to = ["different@example.test"];
    if (mode === "lost claim") repository.begin.mockResolvedValue(null);
    if (mode === "manual review") repository.begin.mockResolvedValue({ ...work, state: "manual_review" });
    if (mode === "marker failure") repository.begin.mockRejectedValue(new Error("Database down"));
    if (mode === "marker failure") await expect(worker.run()).rejects.toThrow();
    else await worker.run();
    expect(provider.send).not.toHaveBeenCalled();
  },
);

it("classifies pre-provider proof rejection as definite and an escaped request failure as ambiguous", async () => {
  const first = setup();
  first.prepare.mockRejectedValue(new DocumentVerificationError());
  await first.worker.run();
  expect(first.repository.finish).toHaveBeenCalledWith(first.work.id, first.work.fence, { kind: "failed", code: "DOCUMENT_INVALID" });
  expect(first.repository.begin).not.toHaveBeenCalled();
  const second = setup();
  second.provider.send.mockRejectedValue(new Error("Connection lost"));
  second.repository.finish.mockResolvedValue({ ...second.work, state: "retry_wait" });
  expect(await second.worker.run()).toEqual({ outcome: "retry_wait", id: second.work.id });
  expect(second.repository.finish).toHaveBeenCalledWith(second.work.id, second.work.fence, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" });
});

it("reuses one provider key and fingerprint after restart and does not claim sent after a lost completion fence", async () => {
  const { worker, work, prepare, repository, provider } = setup();
  repository.finish.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...work, state: "sent" });
  expect(await worker.run()).toEqual({ outcome: "lease_lost", id: work.id });
  work.fence = "2";
  await createOutboxWorker(repository, prepare, provider).run();
  expect(repository.begin.mock.calls[0][2]).toBe(repository.begin.mock.calls[1][2]);
  expect(provider.send.mock.calls.map((call) => call[1])).toEqual([work.providerIdempotencyKey, work.providerIdempotencyKey]);
});

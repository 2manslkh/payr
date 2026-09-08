import { createHash } from "node:crypto";
import { canonicalJson } from "../domain/canonical-json";
import { DocumentVerificationError } from "../documents/contracts";
import type { DeliveryResult, DeliveryWork, OutboxRepository, ReceiptEmailPayload, ReceiptEmailProvider } from "./outbox-contracts";

export function createOutboxWorker(repository: OutboxRepository, prepare: (work: DeliveryWork) => Promise<ReceiptEmailPayload>, provider: ReceiptEmailProvider) {
  return { async run(id?: string) {
    const work = await repository.claim(id);
    if (!work) return { outcome: "idle" as const };
    if (work.state !== "sending") return { outcome: work.state, id: work.id };
    let payload: ReceiptEmailPayload;
    try {
      if (work.receipt.state !== "ready" || !work.receipt.artifact) throw new DocumentVerificationError();
      payload = await prepare(work);
      if (payload.to.length !== 1 || payload.to[0] !== work.normalizedRecipient
        || payload.attachments.length !== 1 || payload.attachments[0].filename !== work.receipt.artifact.pdfFilename) throw new DocumentVerificationError();
    } catch (error) {
      const result: DeliveryResult = error instanceof DocumentVerificationError
        ? { kind: "failed", code: "DOCUMENT_INVALID" } : { kind: "retry", code: "DOCUMENT_UNAVAILABLE" };
      const saved = await repository.finish(work.id, work.fence, result);
      return { outcome: saved?.state ?? "lease_lost" as const, id: work.id };
    }
    const payloadHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
    const markerRequestStarted = performance.now();
    const begun = await repository.begin(work.id, work.fence, payloadHash);
    if (!begun) return { outcome: "lease_lost" as const, id: work.id };
    if (begun.state !== "sending") return { outcome: begun.state, id: work.id };
    if (begun.payloadHash !== payloadHash || begun.providerIdempotencyKey !== work.providerIdempotencyKey
      || !begun.providerRequestStartedAt || !begun.firstProviderAttemptAt) throw new Error("DELIVERY_UNAVAILABLE");
    const markedAt = Date.parse(begun.providerRequestStartedAt);
    // Translate database-relative remaining time to this process's monotonic clock,
    // charging the entire marker round trip and reserving a transport/skew margin.
    const leaseDeadline = markerRequestStarted + Date.parse(begun.leaseUntil ?? "") - markedAt - 5000;
    const retryDeadline = begun.ambiguousSince === null ? Infinity
      : markerRequestStarted + Date.parse(begun.firstProviderAttemptAt) + 86400_000 - markedAt - 30_000;
    if (retryDeadline <= performance.now()) {
      const saved = await repository.finish(work.id, work.fence, { kind: "manual_review", code: "PROVIDER_AMBIGUOUS" });
      return { outcome: saved?.state ?? "lease_lost" as const, id: work.id };
    }
    const deadline = Math.min(performance.now() + 10_000, leaseDeadline, retryDeadline);
    if (!Number.isFinite(deadline) || deadline <= performance.now()) return { outcome: "lease_lost" as const, id: work.id };
    let result: DeliveryResult;
    try { result = await provider.send(payload, work.providerIdempotencyKey, deadline); }
    catch { result = { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }; }
    const saved = await repository.finish(work.id, work.fence, result);
    return { outcome: saved?.state ?? "lease_lost" as const, id: work.id };
  } };
}

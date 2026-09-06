import { randomUUID } from "node:crypto";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { z } from "zod";
import { DocumentVerificationError } from "../documents/contracts";
import { canonicalJson } from "../domain/canonical-json";
import { PublicationError, type InvoiceDocumentPort, type PublicationArtifact, type PublicationLinkConfig, type PublicationRepository, type PublicationWorker } from "./publication-contracts";
import { canonicalPublicationJson, publicationLink } from "./publication-links";

export function createPublicationWorker(repository: PublicationRepository, config: PublicationLinkConfig, documents: InvoiceDocumentPort): PublicationWorker {
  return { async run(attemptId) {
    if (attemptId !== undefined) {
      const parsed = z.string().uuid().safeParse(attemptId);
      if (!parsed.success) throw new PublicationError("INVALID_INPUT", 400);
      attemptId = parsed.data.toLowerCase();
    }
    let claimedId = attemptId;
    try {
      const leaseOwner = randomUUID();
      const attempt = await repository.claim(attemptId ?? null, leaseOwner);
      if (!attempt) return attemptId ? { outcome: "busy", attemptId } : { outcome: "idle" };
      claimedId = attempt.id;
      if (attempt.leaseOwner !== leaseOwner || (attemptId && attempt.id !== attemptId)
        || typeof attempt.fence !== "string" || !/^[1-9][0-9]*$/.test(attempt.fence)) {
        return { outcome: "lease_lost", attemptId: claimedId };
      }
      if (attempt.state !== "rendering" && attempt.state !== "stored") return { outcome: "retryable", attemptId: claimedId };
      const fence = { attemptId: attempt.id, leaseOwner, fence: attempt.fence };
      const invoiceUrl = publicationLink(attempt.link, "invoice-bearer", config);
      const canonicalInvoiceJson = canonicalPublicationJson(attempt);
      let proof;
      try {
        proof = await documents.createOrRead({
          storageKey: attempt.storageKey, canonicalInvoiceJson, invoiceNumber: attempt.invoiceNumber,
          invoiceUrl, publicationSalt: attempt.publicationSalt,
        });
      } catch (error) {
        if (!(error instanceof DocumentVerificationError)) throw error;
        const failed = await repository.fail({ ...fence, failureCode: "ARTIFACT_VERIFICATION_FAILED" });
        return { outcome: failed ? "failed" : "lease_lost", attemptId: claimedId };
      }
      let artifact: PublicationArtifact | null = null;
      // The port's claims are evidence to check, not authority to publish.
      if (proof?.bytes instanceof Uint8Array && proof.bytes.byteLength > 0 && proof.bytes.byteLength <= 10 * 1024 * 1024
        && proof.byteLength === proof.bytes.byteLength && proof.contentType === "application/pdf"
        && Buffer.from(proof.bytes.subarray(0, 5)).equals(Buffer.from("%PDF-"))
        && proof.decodedQrDestination === invoiceUrl) {
        const invoiceDataHash = keccak256(toHex(canonicalInvoiceJson));
        const pdfContentHash = keccak256(proof.bytes);
        const documentCommitment = keccak256(encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
          [attempt.publicationSalt, invoiceDataHash, pdfContentHash],
        ));
        if (proof.invoiceDataHash === invoiceDataHash && proof.pdfContentHash === pdfContentHash && proof.documentCommitment === documentCommitment) {
          artifact = {
            pdfFilename: `${attempt.invoiceNumber}.pdf`, contentType: "application/pdf", byteLength: proof.bytes.byteLength,
            invoiceDataHash, pdfContentHash, documentCommitment, qrVerified: true,
          };
        }
      }
      if (!artifact || (attempt.state === "stored" && canonicalJson(attempt.artifact) !== canonicalJson(artifact))) {
        const failed = await repository.fail({ ...fence, failureCode: "ARTIFACT_VERIFICATION_FAILED" });
        return { outcome: failed ? "failed" : "lease_lost", attemptId: claimedId };
      }
      // Reclaimed stored attempts keep their original facts; only reverify the same private object.
      if (attempt.state !== "stored" && !await repository.store({ ...fence, artifact })) {
        return { outcome: "lease_lost", attemptId: claimedId };
      }
      const finalized = await repository.finalize(fence);
      return { outcome: !finalized ? "lease_lost" : finalized.state === "finalized" ? "finalized"
        : finalized.state === "failed" ? "failed" : "retryable", attemptId: claimedId };
    } catch {
      // A transport error may follow a committed write. Keep the lease and recover after expiry.
      return { outcome: "retryable", ...(claimedId ? { attemptId: claimedId } : {}) };
    }
  } };
}

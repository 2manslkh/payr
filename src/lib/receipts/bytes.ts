import { keccak256 } from "viem";
import { DocumentUnavailableError, type PrivateDocumentStorage } from "../documents/contracts";
import type { ReceiptWork } from "./contracts";

export async function readReceiptBytes(work: ReceiptWork, storage: PrivateDocumentStorage) {
  const artifact = work.artifact;
  if (work.state !== "ready" || !artifact || artifact.storageKey !== `workspace/${work.workspaceId}/receipt/${work.id}.pdf`) throw new DocumentUnavailableError();
  const stored = await storage.read(artifact.storageKey);
  if (!stored || stored.contentType !== "application/pdf" || stored.byteLength !== stored.bytes.byteLength
    || stored.byteLength !== artifact.byteLength || stored.byteLength < 5 || stored.byteLength > 10485760) throw new DocumentUnavailableError();
  const bytes = new Uint8Array(stored.bytes);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-" || keccak256(bytes) !== artifact.pdfContentHash) throw new DocumentUnavailableError();
  return bytes;
}

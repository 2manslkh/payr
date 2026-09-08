import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { createKeyedTokenCodec } from "../security/keyed-token";
import type { ReceiptWork } from "./contracts";

export function testReceiptWork() {
  const id = "00000000-0000-4000-8000-000000000001";
  const receiptId = "00000000-0000-4000-8000-000000000002";
  const tokenId = "00000000-0000-4000-8000-000000000003";
  const keys = new Map([[1, new Uint8Array(32).fill(8)]]);
  const codec = createKeyedTokenCodec(keys);
  const hash = `0x${"1".repeat(64)}` as const;
  const contract = `0x${"3".repeat(40)}` as const;
  const snapshot = testPublicationSnapshot();
  const link = { tokenId: id, keyVersion: 1, verifierHash: codec.derive(id, "invoice-bearer", 1).verifierHash,
    activatedAt: "2030-01-01T00:00:00Z", expiresAt: "2031-01-01T00:00:00Z", revokedAt: null };
  const work: ReceiptWork = {
    id: receiptId, workspaceId: id, invoiceId: id, invoiceVersionId: id, settlementId: id,
    state: "rendering", fence: "1", attemptCount: 1, leaseUntil: "2030-01-02T00:02:00Z", nextAttemptAt: null, failureCode: null,
    link: { ...link, tokenId, verifierHash: codec.derive(tokenId, "receipt-bearer", 1).verifierHash }, artifact: null,
    attempt: { id, workspaceId: id, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-000001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: contract, invoiceKey: hash, publicationSalt: hash,
      storageKey: `workspace/${id}/invoice/${id}/1/attempt/${id}.pdf`, link,
      leaseOwner: id, leaseUntil: "2030-01-01T00:01:00Z", fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00Z",
      artifact: { pdfFilename: "invoice.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: hash,
        pdfContentHash: hash, documentCommitment: hash, qrVerified: true } },
    settlement: { chainId: 5042002, contractAddress: contract, invoiceVersion: 1, transactionHash: `0x${"4".repeat(64)}`,
      logIndex: 3, blockNumber: "100", blockTime: "2030-01-02T00:00:00Z", payer: `0x${"5".repeat(40)}`,
      payee: snapshot.sender.payoutWallet as `0x${string}`, amountDecimal: snapshot.amountDecimal,
      amountAtomic: snapshot.amountAtomic, documentCommitment: hash },
  };
  return { work, config: { keys, appOrigin: "https://example.test", explorerOrigin: "https://explorer.test" } };
}

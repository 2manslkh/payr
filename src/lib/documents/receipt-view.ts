import { receiptWorkSchema } from "../db/receipts";
import { publicationLink } from "../invoices/publication-links";
import type { PublicationLinkConfig } from "../invoices/publication-contracts";
import type { ReceiptWork } from "../receipts/contracts";
import { DocumentVerificationError } from "./contracts";

export function buildReceiptView(work: ReceiptWork, config: PublicationLinkConfig) {
  const parsed = receiptWorkSchema.safeParse(work);
  if (!parsed.success || work.settlement.chainId !== 5042002) throw new DocumentVerificationError();
  const { attempt, settlement } = parsed.data;
  return {
    invoiceNumber: attempt.invoiceNumber, invoiceVersion: attempt.invoiceVersion,
    amountDecimal: settlement.amountDecimal, amountAtomic: settlement.amountAtomic,
    network: "USDC on Arc Testnet (5042002)", contractAddress: settlement.contractAddress,
    payer: settlement.payer, payee: settlement.payee, blockNumber: settlement.blockNumber,
    blockTime: new Date(settlement.blockTime).toISOString(), transactionHash: settlement.transactionHash,
    transactionUrl: new URL(`/tx/${settlement.transactionHash}`, config.explorerOrigin).href,
    invoicePdfContentHash: attempt.artifact!.pdfContentHash, documentCommitment: settlement.documentCommitment,
    receiptUrl: publicationLink(work.link, "receipt-bearer", config),
  };
}
export type ReceiptView = ReturnType<typeof buildReceiptView>;

export function receiptProofRows(view: ReceiptView): Array<[string, string]> {
  return [["Network", view.network], ["Payer", view.payer], ["Payee", view.payee], ["Settlement contract", view.contractAddress],
    ["Settlement time (UTC)", view.blockTime], ["Block", view.blockNumber], ["Transaction", view.transactionHash],
    ["Explorer", view.transactionUrl], ["Invoice PDF hash", view.invoicePdfContentHash], ["Document commitment", view.documentCommitment]];
}

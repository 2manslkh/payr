import { encodeAbiParameters, keccak256, toHex } from "viem";

export function computeDocumentCommitment(canonicalInvoiceJson: string, bytes: Uint8Array, publicationSalt: `0x${string}`) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(publicationSalt)) throw new TypeError("Invalid publication salt");
  const invoiceDataHash = keccak256(toHex(canonicalInvoiceJson));
  const pdfContentHash = keccak256(bytes);
  const documentCommitment = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
    [publicationSalt, invoiceDataHash, pdfContentHash],
  ));
  return { invoiceDataHash, pdfContentHash, documentCommitment };
}

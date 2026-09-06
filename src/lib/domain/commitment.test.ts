import { expect, it } from "vitest";
import { computeDocumentCommitment } from "./commitment";

it("matches an independent Keccak / three-bytes32 ABI vector over exact UTF-8 and bytes", () => {
  // Independently calculated with Foundry cast keccak, then the literal 96-byte ABI preimage.
  expect(computeDocumentCommitment("{}", new Uint8Array([0, 97, 98, 99, 0]).subarray(1, 4), `0x${"00".repeat(32)}`)).toEqual({
    invoiceDataHash: "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d",
    pdfContentHash: "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    documentCommitment: "0xcd868f2730ffb608a82f8bdc5733b2a16646d5aea455a77bdee6f588deff935b",
  });
});

it("binds the exact JSON, PDF bytes and salt, without trimming or accepting a non-bytes32 salt", () => {
  const bytes = new Uint8Array([97, 98, 99]), salt = `0x${"00".repeat(32)}` as const;
  const baseline = computeDocumentCommitment("{}", bytes, salt);
  expect(computeDocumentCommitment("{} ", bytes, salt).invoiceDataHash).not.toBe(baseline.invoiceDataHash);
  expect(computeDocumentCommitment("{}", new Uint8Array([97, 98, 100]), salt).pdfContentHash).not.toBe(baseline.pdfContentHash);
  expect(computeDocumentCommitment("{}", bytes, `0x${"01".repeat(32)}`).documentCommitment).not.toBe(baseline.documentCommitment);
  expect(() => computeDocumentCommitment("{}", bytes, "0x00")).toThrow("Invalid publication salt");
});

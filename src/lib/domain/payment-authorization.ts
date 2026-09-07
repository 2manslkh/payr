import type { Address, Hex } from "viem";

export const paymentTypes = {
  EIP712Domain: [
    { name: "name", type: "string" }, { name: "version", type: "string" },
    { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
  ],
  PayrPayment: [
    { name: "invoiceKey", type: "bytes32" }, { name: "documentCommitment", type: "bytes32" },
    { name: "payee", type: "address" }, { name: "amount", type: "uint256" },
    { name: "authorizationValidUntil", type: "uint64" }, { name: "payableUntil", type: "uint64" },
  ],
} as const;

export type PaymentMessage = {
  invoiceKey: Hex; documentCommitment: Hex; payee: Address; amount: bigint;
  authorizationValidUntil: bigint; payableUntil: bigint;
};

export function paymentTypedData(chainId: number, verifyingContract: Address, message: PaymentMessage) {
  return { domain: { name: "Payr", version: "1", chainId: BigInt(chainId), verifyingContract }, types: paymentTypes, primaryType: "PayrPayment", message } as const;
}
export type PaymentTypedData = ReturnType<typeof paymentTypedData>;

export function authorizationWindow(nowMs: number, payableUntilSecond: number) {
  const issuedAtSecond = Math.floor(nowMs / 1000);
  const authorizationValidUntil = Math.min(issuedAtSecond + 600, payableUntilSecond - 1);
  if (!Number.isSafeInteger(issuedAtSecond) || issuedAtSecond < 0 || !Number.isSafeInteger(payableUntilSecond)
    || authorizationValidUntil <= issuedAtSecond) throw new Error("AUTHORIZATION_NOT_PAYABLE");
  return { issuedAtSecond, authorizationValidUntil };
}

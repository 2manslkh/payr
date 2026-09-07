import { describe, expect, it } from "vitest";
import { paymentTypedData, authorizationWindow } from "./payment-authorization";
import { hashTypedData, keccak256, toHex } from "viem";

describe("payment authorization", () => {
  it("matches the Solidity golden typed-data digest", () => {
    expect(hashTypedData(paymentTypedData(5042002, `0x${"11".repeat(20)}`, {
      invoiceKey: keccak256(toHex("invoice")), documentCommitment: keccak256(toHex("document")),
      payee: "0x000000000000000000000000000000000000bEEF", amount: 10n ** 18n,
      authorizationValidUntil: 1600n, payableUntil: 2000n,
    }))).toBe("0xc82ec9352b20bdb50fb6a7b196bf453dc75465259cbcdf69d97ff4c429df04e4");
  });
  it("uses integer seconds and caps validity strictly before payability", () => {
    expect(authorizationWindow(1_000_999, 2000)).toEqual({ issuedAtSecond: 1000, authorizationValidUntil: 1600 });
    expect(authorizationWindow(1_000_999, 1500)).toEqual({ issuedAtSecond: 1000, authorizationValidUntil: 1499 });
    for (const deadline of [999, 1000, 1001]) expect(() => authorizationWindow(1_000_000, deadline)).toThrow();
  });
  it("pins domain, primary type and exact field order", () => {
    const typed = paymentTypedData(5042002, `0x${"11".repeat(20)}`, {
      invoiceKey: `0x${"22".repeat(32)}`, documentCommitment: `0x${"33".repeat(32)}`,
      payee: `0x${"44".repeat(20)}`, amount: 1n, authorizationValidUntil: 1600n, payableUntil: 2000n,
    });
    expect(typed.domain).toEqual({ name: "Payr", version: "1", chainId: 5042002n, verifyingContract: `0x${"11".repeat(20)}` });
    expect(typed.primaryType).toBe("PayrPayment");
    expect(typed.types.PayrPayment.map((field) => `${field.name}:${field.type}`)).toEqual([
      "invoiceKey:bytes32", "documentCommitment:bytes32", "payee:address", "amount:uint256", "authorizationValidUntil:uint64", "payableUntil:uint64",
    ]);
  });
});

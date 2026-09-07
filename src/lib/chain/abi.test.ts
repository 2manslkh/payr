import { expect, it } from "vitest";
import { payrSettlementAbi } from "./abi";
import { arcTestnet } from "./arc";

it("pins native Arc testnet USDC and exact payable ABI", () => {
  expect(arcTestnet.id).toBe(5042002);
  expect(arcTestnet.nativeCurrency).toEqual({ name: "USDC", symbol: "USDC", decimals: 18 });
  const payment = payrSettlementAbi.find((entry) => entry.type === "function" && entry.name === "payInvoice")!;
  expect(payment.stateMutability).toBe("payable");
  expect(payment.inputs.map((input) => input.type)).toEqual(["bytes32", "bytes32", "address", "uint256", "uint64", "uint64", "bytes"]);
  const event = payrSettlementAbi.find((entry) => entry.type === "event" && entry.name === "InvoicePaid")!;
  expect(event.inputs.map((input) => `${input.name}:${input.indexed}`)).toEqual([
    "invoiceKey:true", "documentCommitment:false", "payer:true", "payee:true", "amount:false",
  ]);
});

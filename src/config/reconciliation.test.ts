import { expect, it } from "vitest";
import { createReconciliationEnv } from "./env";

const valid = { NEXT_PUBLIC_APP_URL: "https://example.test", NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"3".repeat(40)}`,
  ARC_CHAIN_ID: "5042002", ARC_RPC_URL: "https://rpc.test", LINK_ACTIVE_KEY_VERSION: "1",
  LINK_TOKEN_KEY_V1: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
  PAYR_RECONCILIATION_START_BLOCK: "9007199254740993" };

it("parses exact bigint recovery position without signer or email credentials", () => {
  expect(createReconciliationEnv(valid)).toMatchObject({ chainId: 5042002, startBlock: 9007199254740993n,
    contracts: [valid.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS] });
});

it("normalizes and deduplicates the current and retained deployments", () => {
  const other = `0x${"a".repeat(40)}`;
  expect(createReconciliationEnv({ ...valid, PAYR_RETAINED_SETTLEMENT_CONTRACTS:
    `${valid.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS},${other},0x${"A".repeat(40)}` }).contracts).toEqual([valid.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS, other]);
});

it.each([
  { ARC_CHAIN_ID: "1" }, { ARC_RPC_URL: "http://rpc.test" }, { PAYR_RECONCILIATION_START_BLOCK: "-1" },
  { PAYR_RECONCILIATION_START_BLOCK: "1e3" }, { PAYR_RECONCILIATION_START_BLOCK: "01" },
  { PAYR_RETAINED_SETTLEMENT_CONTRACTS: `${valid.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS},` },
])("fails closed on invalid reconciliation configuration: %j", (change) => {
  expect(() => createReconciliationEnv({ ...valid, ...change })).toThrow();
});

it.each([
  { PAYR_RETAINED_SETTLEMENT_CONTRACTS: `0x${"0".repeat(40)}` },
  { PAYR_RETAINED_SETTLEMENT_CONTRACTS: Array.from({ length: 21 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`).join(",") },
  { PAYR_RECONCILIATION_START_BLOCK: "1".repeat(79) },
])("rejects configuration that cannot be bounded safely: %j", (change) => {
  expect(() => createReconciliationEnv({ ...valid, ...change })).toThrow();
});

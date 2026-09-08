// @vitest-environment node
import { expect, it } from "vitest";
import { createWalletPaymentEnv } from "./env";
const env = { NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "1".repeat(32), NEXT_PUBLIC_APP_URL: "https://example.test",
  ARC_CHAIN_ID: "5042002", PAYR_MONEY_MODE: "testnet", ARC_RPC_URL: "https://rpc.test", PAYR_ATTESTOR_ADDRESS: `0x${"2".repeat(40)}` };
it("leaves released read-only UI available without wallet configuration", () => { expect(createWalletPaymentEnv({})).toBeNull(); });
it("exposes only non-secret wallet settings", () => {
  expect(createWalletPaymentEnv({ ...env, TESTNET_ATTESTOR_PRIVATE_KEY: "private" })).toEqual({ projectId: "1".repeat(32), appOrigin: "https://example.test", rpcUrl: "https://rpc.test", attestor: `0x${"2".repeat(40)}` });
});
it.each(["http://rpc.test", "https://user:password@rpc.test", "https://rpc.test/key", "https://rpc.test/?key=secret", "https://rpc.test/#secret"])("rejects unsafe public RPC %s", (rpc) => {
  expect(() => createWalletPaymentEnv({ ...env, ARC_RPC_URL: rpc })).toThrow();
});
it("rejects mainnet mode and wrong chain", () => {
  expect(() => createWalletPaymentEnv({ ...env, PAYR_MONEY_MODE: "mainnet" })).toThrow();
  expect(() => createWalletPaymentEnv({ ...env, ARC_CHAIN_ID: "1" })).toThrow();
});

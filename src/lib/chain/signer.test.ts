// @vitest-environment node
import { expect, it } from "vitest";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPaymentEnv } from "../../config/env";
import { paymentTypedData } from "../domain/payment-authorization";
import { createLocalTestnetSigner } from "./signer";

const key = `0x${"0".repeat(63)}1` as const;
const address = `0x${"11".repeat(20)}` as const;
const env = {
  PAYR_SIGNER_MODE: "local-testnet", ALLOW_TESTNET_LOCAL_SIGNER: "true", PAYR_MONEY_MODE: "testnet",
  ARC_CHAIN_ID: "5042002", ARC_RPC_URL: "https://rpc.testnet.arc.network",
  NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: address, TESTNET_ATTESTOR_PRIVATE_KEY: key,
  PAYR_ATTESTOR_ADDRESS: privateKeyToAccount(key).address,
};
const typed = paymentTypedData(5042002, address, {
  invoiceKey: `0x${"22".repeat(32)}`, documentCommitment: `0x${"33".repeat(32)}`, payee: address,
  amount: 1n, authorizationValidUntil: 1600n, payableUntil: 2000n,
});

it("signs contract-bound typed data with the unfunded testnet attestor", async () => {
  const signer = createLocalTestnetSigner(createPaymentEnv(env));
  const signature = await signer.sign(typed);
  expect(await recoverTypedDataAddress({ ...typed, signature })).toBe(signer.attestor);
});

it.each([
  { ALLOW_TESTNET_LOCAL_SIGNER: "false" }, { ALLOW_TESTNET_LOCAL_SIGNER: undefined },
  { PAYR_SIGNER_MODE: "privy" }, { PAYR_MONEY_MODE: "mainnet" }, { PAYR_MONEY_MODE: "production-money" },
  { PAYR_MONEY_MODE: undefined }, { ARC_CHAIN_ID: "1" }, { TESTNET_ATTESTOR_PRIVATE_KEY: "invalid" },
  { PAYR_ATTESTOR_ADDRESS: address }, { NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"0".repeat(40)}` },
])("fails closed on unsafe signer configuration %j", (change) => {
  expect(() => createLocalTestnetSigner(createPaymentEnv({ ...env, ...change }))).toThrow();
});

it("rejects altered domain and type maps rather than signing arbitrary typed data", async () => {
  const signer = createLocalTestnetSigner(createPaymentEnv(env));
  for (const change of [
    { domain: { ...typed.domain, chainId: 1n } },
    { domain: { ...typed.domain, verifyingContract: `0x${"44".repeat(20)}` as const } },
    { domain: { ...typed.domain, name: "Other" } },
    { primaryType: "Other" }, { types: { ...typed.types, PayrPayment: [...typed.types.PayrPayment].reverse() } },
  ]) await expect(signer.sign({ ...typed, ...change } as typeof typed)).rejects.toThrow("AUTHORIZATION_DENIED");
});

it("keeps signing explicitly retained frozen deployments after the publication default changes", async () => {
  const signer = createLocalTestnetSigner(createPaymentEnv({ ...env,
    NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"55".repeat(20)}`, PAYR_RETAINED_SETTLEMENT_CONTRACTS: address,
  }));
  const signature = await signer.sign(typed);
  expect(await recoverTypedDataAddress({ ...typed, signature })).toBe(signer.attestor);
});

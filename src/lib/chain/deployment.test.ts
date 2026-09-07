// @vitest-environment node
import { expect, it, vi } from "vitest";
import { encodeDeployData, keccak256, type PublicClient } from "viem";
import { payrSettlementAbi } from "./abi";
import { publicRpcHost, readDeployment } from "./deployment";

it.each(["http://rpc.test", "https://user:secret@rpc.test", "https://rpc.test/key", "https://rpc.test/?key=secret", "https://rpc.test/#secret"])("rejects credential-bearing evidence RPC %s", (url) => {
  expect(() => publicRpcHost(url)).toThrow();
});

function setup() {
  const hash = `0x${"1".repeat(64)}` as const;
  const address = `0x${"2".repeat(40)}` as const;
  const input = { transactionHash: hash, attestor: address, creationBytecode: "0x6000" as const, rpcUrl: "https://rpc.test" };
  const receipt = { status: "success", contractAddress: address, blockHash: hash, transactionHash: hash, blockNumber: 42n };
  const transaction = { to: null, hash, blockHash: hash,
    input: encodeDeployData({ abi: payrSettlementAbi, bytecode: input.creationBytecode, args: [address] }) };
  const client = { getChainId: vi.fn().mockResolvedValue(5042002), getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getTransaction: vi.fn().mockResolvedValue(transaction), getCode: vi.fn().mockResolvedValue("0x6001"), readContract: vi.fn().mockResolvedValue(address) };
  return { receipt, transaction, client, input, read: () => readDeployment(client as unknown as PublicClient, input) };
}

it("generates public evidence only from successful reviewed creation and attestor read-back", async () => {
  const { read, input } = setup();
  expect(await read()).toEqual({ schemaVersion: "payr.deployment.v1", chainId: 5042002, rpcHost: "rpc.test",
    explorerBase: "https://testnet.arcscan.app", contractAddress: input.attestor, attestor: input.attestor,
    deploymentTransaction: input.transactionHash, deploymentBlock: "42", bytecodeHash: keccak256("0x6001") });
});

it.each(["chain", "receipt", "creation", "target", "code", "attestor"])("fails closed on mismatched %s", async (kind) => {
  const { read, receipt, transaction, client } = setup();
  if (kind === "chain") client.getChainId.mockResolvedValue(1);
  if (kind === "receipt") receipt.status = "reverted";
  if (kind === "creation") transaction.input = "0x";
  if (kind === "target") receipt.contractAddress = `0x${"0".repeat(40)}`;
  if (kind === "code") client.getCode.mockResolvedValue("0x");
  if (kind === "attestor") client.readContract.mockResolvedValue(`0x${"0".repeat(40)}`);
  await expect(read()).rejects.toThrow();
});

import { encodeDeployData, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { payrSettlementAbi } from "./abi";
import { ARC_TESTNET_CHAIN_ID } from "./arc";

export function publicRpcHost(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Deployment evidence requires a credential-free HTTPS RPC origin");
  }
  return url.host;
}

export async function readDeployment(client: Pick<PublicClient, "getChainId" | "getTransactionReceipt" | "getTransaction" | "getCode" | "readContract">, input: {
  transactionHash: Hex; attestor: Address; creationBytecode: Hex; rpcUrl: string;
}) {
  const rpcHost = publicRpcHost(input.rpcUrl);
  if (await client.getChainId() !== ARC_TESTNET_CHAIN_ID || /^0x0{40}$/i.test(input.attestor)) throw new Error("Deployment binding mismatch");
  const receipt = await client.getTransactionReceipt({ hash: input.transactionHash });
  const transaction = await client.getTransaction({ hash: input.transactionHash });
  if (receipt.status !== "success" || !receipt.contractAddress || /^0x0{40}$/i.test(receipt.contractAddress) || transaction.to !== null
    || transaction.blockHash !== receipt.blockHash || transaction.hash !== receipt.transactionHash
    || transaction.input.toLowerCase() !== encodeDeployData({ abi: payrSettlementAbi, bytecode: input.creationBytecode, args: [input.attestor] }).toLowerCase()) {
    throw new Error("Deployment is not the reviewed creation transaction");
  }
  const code = await client.getCode({ address: receipt.contractAddress });
  const attestor = await client.readContract({ address: receipt.contractAddress, abi: payrSettlementAbi, functionName: "attestor" });
  if (!code || code === "0x" || attestor.toLowerCase() !== input.attestor.toLowerCase()) throw new Error("Deployed contract read-back mismatch");
  return {
    schemaVersion: "payr.deployment.v1", chainId: ARC_TESTNET_CHAIN_ID, rpcHost,
    explorerBase: "https://testnet.arcscan.app", contractAddress: receipt.contractAddress.toLowerCase(),
    attestor: attestor.toLowerCase(), deploymentTransaction: receipt.transactionHash,
    deploymentBlock: receipt.blockNumber.toString(), bytecodeHash: keccak256(code),
  };
}

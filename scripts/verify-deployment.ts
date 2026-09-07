import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { z } from "zod";
import { arcTestnet } from "../src/lib/chain/arc";
import { readDeployment } from "../src/lib/chain/deployment";

async function main() {
  const config = z.object({
    ARC_RPC_URL: z.string().url(),
    PAYR_ATTESTOR_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`),
    PAYR_DEPLOYMENT_TRANSACTION: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((v) => v as `0x${string}`),
  }).parse(process.env);
  const artifact = JSON.parse(await readFile("contracts/out/PayrSettlement.sol/PayrSettlement.json", "utf8"));
  const bytecode = z.string().regex(/^0x[0-9a-fA-F]+$/).parse(artifact.bytecode.object) as `0x${string}`;
  const client = createPublicClient({ chain: arcTestnet, transport: http(config.ARC_RPC_URL, { retryCount: 0, timeout: 15_000 }) });
  const evidence = await readDeployment(client, {
    transactionHash: config.PAYR_DEPLOYMENT_TRANSACTION, attestor: config.PAYR_ATTESTOR_ADDRESS,
    creationBytecode: bytecode, rpcUrl: config.ARC_RPC_URL,
  });
  const path = "contracts/deployments/arc-testnet.json";
  if (process.argv.includes("--write")) await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  else {
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(evidence)) throw new Error("Deployment evidence mismatch");
  }
  console.log(`Verified Arc testnet contract ${evidence.contractAddress} at block ${evidence.deploymentBlock}.`);
}

main().catch(() => { console.error("Deployment verification failed; no verified metadata was written. Check configuration, build artifact, and authoritative chain evidence."); process.exitCode = 1; });

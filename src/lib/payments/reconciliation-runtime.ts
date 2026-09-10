import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import { createReconciliationEnv } from "../../config/env";
import { arcTestnet } from "../chain/arc";
import { createSupabaseAdminClient } from "../db/admin";
import { createReconciliationRepository } from "../db/reconciliation";
import { createReconciler } from "./reconcile";
import { after } from "next/server";

export function afterSettlement(receiptDocumentId: string, deadline: number) {
  after(async () => {
    const { processReceipt } = await import("../email/runtime");
    await processReceipt(receiptDocumentId, deadline);
  });
}

export function createReconciliationRuntime() {
  const deadline = performance.now() + 280_000;
  const scheduled = new Set<string>();
  const config = createReconciliationEnv();
  const database = createSupabaseAdminClient();
  const client = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl, { retryCount: 0, timeout: 10_000 }) });
  return createReconciler({
    chainId: () => client.getChainId(),
    receipt: async (hash) => {
      try { return await client.getTransactionReceipt({ hash }); }
      catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
    },
    block: async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash || block.number === null) throw new Error("Block unavailable");
      return { hash: block.hash, number: block.number, timestamp: block.timestamp };
    },
    latest: () => client.getBlockNumber({ cacheTime: 0 }),
    transactions: async (address, fromBlock, toBlock) => {
      // Strict ABI filtering silently drops malformed candidates. Preserve all contract logs for the receipt verifier.
      const logs = await client.getLogs({ address, fromBlock, toBlock });
      return logs.map((log) => {
        if (log.removed || !log.transactionHash || !log.blockHash || log.blockNumber === null || log.logIndex === null) throw new Error("Log unavailable");
        return { address: log.address, transactionHash: log.transactionHash, blockHash: log.blockHash, blockNumber: log.blockNumber, logIndex: log.logIndex };
      });
    },
  }, createReconciliationRepository({ rpc: (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(10_000)) }), config, (id) => {
    // Bound backfill fanout; cron remains the recovery path for the rest.
    if (scheduled.has(id) || scheduled.size >= 2) return;
    afterSettlement(id, deadline);
    scheduled.add(id);
  });
}

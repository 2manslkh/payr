import { z } from "zod";
import { publicationAttemptSchema } from "./publication";
import { createPayrRepositories, type RpcClient } from "./repositories";
import type { ReconciliationRepository } from "../payments/reconciliation-contracts";

export function createReconciliationRepository(client: RpcClient): ReconciliationRepository {
  async function call<T>(name: string, input: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    try {
      const result = await client.rpc(name, input);
      if (result.error) throw new Error();
      return schema.parse(result.data);
    } catch { throw new Error("RECONCILIATION_UNAVAILABLE"); }
  }
  return {
    recordSettlement: createPayrRepositories(client).recordSettlement,
    async findTarget(chainId, contract, invoiceKey) {
      return call("payr_reconciliation_target_v1", { p_chain_id: chainId, p_contract_address: contract, p_invoice_key: invoiceKey },
        publicationAttemptSchema.refine((a) => a.chainId === chainId && a.contractAddress === contract && a.invoiceKey === invoiceKey && a.state === "finalized").nullable());
    },
    async cursor(chainId, contract, startBlock) {
      const position = await call("payr_reconciliation_position_v1", { p_chain_id: chainId, p_contract_address: contract, p_start_block: startBlock.toString() },
        z.object({ block: z.string().regex(/^(0|[1-9][0-9]*)$/), logIndex: z.number().int().min(0).max(2147483647) }).strict());
      return { block: BigInt(position.block), logIndex: position.logIndex };
    },
    async advance(chainId, contract, expected, next) {
      return call("payr_advance_reconciliation_position_v1", { p_chain_id: chainId, p_contract_address: contract,
        p_expected: expected.block.toString(), p_expected_log: expected.logIndex, p_next: next.block.toString(), p_next_log: next.logIndex }, z.boolean());
    },
  };
}

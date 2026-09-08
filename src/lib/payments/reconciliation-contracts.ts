import type { Address, Hex, TransactionReceipt } from "viem";
import type { PublicationAttempt, PublicationConfig } from "../invoices/publication-contracts";
import type { PayrRepositories } from "../db/repositories";

export type ReconciliationConfig = PublicationConfig & {
  rpcUrl: string; contracts: Address[]; startBlock: bigint;
};
export type ReconciliationRepository = Pick<PayrRepositories, "recordSettlement"> & {
  findTarget(chainId: number, contract: Address, invoiceKey: Hex): Promise<PublicationAttempt | null>;
  cursor(chainId: number, contract: Address, startBlock: bigint): Promise<RecoveryPosition>;
  advance(chainId: number, contract: Address, expected: RecoveryPosition, next: RecoveryPosition): Promise<boolean>;
};
export type RecoveryPosition = { block: bigint; logIndex: number };
export type ChainEventRef = { address: Address; transactionHash: Hex; blockHash: Hex; blockNumber: bigint; logIndex: number };
export type SettlementChain = {
  chainId(): Promise<number>;
  receipt(hash: Hex): Promise<TransactionReceipt | null>;
  block(number: bigint): Promise<{ hash: Hex; number: bigint; timestamp: bigint }>;
  latest(): Promise<bigint>;
  transactions(contract: Address, from: bigint, to: bigint): Promise<ChainEventRef[]>;
};
export class ReconciliationError extends Error {
  constructor(public readonly code: "INVALID_TRANSACTION" | "RECONCILIATION_UNAVAILABLE") { super(code); }
}

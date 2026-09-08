import { randomUUID } from "node:crypto";
import { decodeEventLog, toEventSelector, type Hex } from "viem";
import { payrSettlementAbi } from "../chain/abi";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { receiptRecipients } from "../email/address";
import { ReconciliationError, type ChainEventRef, type ReconciliationConfig, type ReconciliationRepository, type SettlementChain } from "./reconciliation-contracts";

const topic = toEventSelector("InvoicePaid(bytes32,bytes32,address,address,uint256)");

export function createReconciler(chain: SettlementChain, repository: ReconciliationRepository, config: ReconciliationConfig) {
  async function transaction(hash: Hex, expected?: ChainEventRef, deadline = Date.now() + 240_000): Promise<{ outcome: "pending" | "invalid" | "verified"; reason?: "reverted" }> {
    try {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new ReconciliationError("INVALID_TRANSACTION");
      if (Date.now() >= deadline) return { outcome: "pending" };
      if (await chain.chainId() !== config.chainId) throw new Error();
      if (Date.now() >= deadline) return { outcome: "pending" };
      const receipt = await chain.receipt(hash);
      if (!receipt) return { outcome: "pending" };
      if (Date.now() >= deadline) return { outcome: "pending" };
      if (receipt.status !== "success") {
        if (expected) throw new Error();
        return { outcome: "invalid", reason: "reverted" };
      }
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.blockNumber < 0n) throw new Error();
      const block = await chain.block(receipt.blockNumber);
      if (Date.now() >= deadline) return { outcome: "pending" };
      if (block.hash !== receipt.blockHash || block.number !== receipt.blockNumber || block.timestamp < 0n
        || block.timestamp > BigInt(Math.floor(8.64e15 / 1000))) throw new Error();
      if (expected && (expected.blockHash !== block.hash || expected.blockNumber !== block.number
        || !receipt.logs.some((log) => log.logIndex === expected.logIndex && log.transactionHash === expected.transactionHash
          && log.topics[0] === topic && log.address.toLowerCase() === expected.address.toLowerCase()
          && config.contracts.includes(log.address.toLowerCase() as Hex)))) throw new Error();
      let verified = false;
      let events = 0;
      for (const log of receipt.logs) {
        if (expected && log.logIndex !== expected.logIndex) continue;
        const address = log.address.toLowerCase() as `0x${string}`;
        if (!config.contracts.includes(address) || log.topics[0] !== topic) continue;
        if (events >= 100 || Date.now() >= deadline) return { outcome: "pending" };
        events++;
        if (log.removed || log.transactionHash !== receipt.transactionHash || log.blockHash !== block.hash
          || log.blockNumber !== block.number || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 || log.logIndex >= 2147483647
          || log.topics.length !== 4 || !/^0x[0-9a-fA-F]{128}$/.test(log.data)) throw new Error();
        const { args } = decodeEventLog({ abi: payrSettlementAbi, eventName: "InvoicePaid", topics: log.topics, data: log.data, strict: true });
        const target = await repository.findTarget(config.chainId, address, args.invoiceKey);
        if (Date.now() >= deadline) return { outcome: "pending" };
        if (!target) {
          // A signed payment on our contract must not disappear from recovery after a partial database restore.
          if (expected) throw new Error();
          continue;
        }
        if (target.chainId !== config.chainId || target.contractAddress !== address || target.invoiceKey !== args.invoiceKey
          || target.state !== "finalized" || !target.artifact || target.artifact.documentCommitment !== args.documentCommitment
          || target.snapshot.sender.payoutWallet !== args.payee.toLowerCase() || BigInt(target.snapshot.amountAtomic) !== args.amount
          || block.timestamp >= BigInt(Date.parse(target.snapshot.payableUntil) / 1000)) throw new Error();
        const tokenId = randomUUID();
        const receiptToken = createKeyedTokenCodec(config.keys).derive(tokenId, "receipt-bearer", config.activeKeyVersion);
        const deliveries = receiptRecipients(target.snapshot.sender.contactEmail!, target.snapshot.client.contactEmail);
        await repository.recordSettlement({ workspaceId: target.workspaceId, chainId: config.chainId, contractAddress: address,
          invoiceKey: args.invoiceKey, transactionHash: hash.toLowerCase() as Hex, logIndex: log.logIndex,
          blockNumber: block.number.toString(), blockTime: new Date(Number(block.timestamp) * 1000).toISOString(),
          documentCommitment: args.documentCommitment, payer: args.payer.toLowerCase() as Hex, payee: args.payee.toLowerCase() as Hex,
          amountAtomic: args.amount.toString(), receiptTokenId: tokenId, receiptKeyVersion: config.activeKeyVersion,
          receiptVerifierHash: receiptToken.verifierHash, receiptExpiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(), deliveries });
        verified = true;
      }
      return { outcome: verified ? "verified" : "invalid" };
    } catch (error) {
      if (error instanceof ReconciliationError) throw error;
      throw new ReconciliationError("RECONCILIATION_UNAVAILABLE");
    }
  }
  return {
    transaction,
    async backfill(maxRanges = 5) {
      try {
        const deadline = Date.now() + 240_000;
        if (!Number.isSafeInteger(maxRanges) || maxRanges < 1 || maxRanges > 50
          || config.contracts.length < 1 || config.contracts.length > 21) throw new Error();
        if (await chain.chainId() !== config.chainId) throw new Error();
        let ranges = 0, events = 0, failed = false;
        const result = () => {
          if (failed) throw new Error();
          return { ranges, events };
        };
        if (Date.now() >= deadline) return result();
        const latest = await chain.latest();
        if (latest < 0n) throw new Error();
        if (Date.now() >= deadline) return result();
        const positions = (await Promise.all(config.contracts.map(async (address) => {
          try { return { address, next: await repository.cursor(config.chainId, address, config.startBlock) }; }
          catch { failed = true; return null; }
        }))).filter((position) => position !== null);
        // Lagging cursors go first even across fresh server instances; each contract gets a bounded share.
        positions.sort((a, b) => a.next.block < b.next.block ? -1 : a.next.block > b.next.block ? 1 : a.next.logIndex - b.next.logIndex);
        const rangeShare = Math.max(1, Math.floor(maxRanges / positions.length));
        const eventShare = Math.max(1, Math.floor(100 / positions.length));
        contracts: for (const [index, position] of positions.entries()) {
          const { address } = position;
          let next = position.next, contractRanges = 0, contractEvents = 0;
          const now = Date.now();
          const contractDeadline = now + Math.floor((deadline - now) / (positions.length - index));
          try {
            while (next.block <= latest && ranges < maxRanges && contractRanges < rangeShare) {
              if (Date.now() >= deadline) return result();
              if ((contractRanges > 0 || contractEvents > 0) && Date.now() >= contractDeadline) continue contracts;
              const start = next.block, end = start + 9999n < latest ? start + 9999n : latest;
              const logs = (await chain.transactions(address, start, end))
                .sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
              if (Date.now() >= deadline) return result();
              for (const log of logs) {
                if (log.address.toLowerCase() !== address || log.blockNumber < start || log.blockNumber > end
                  || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 || log.logIndex >= 2147483647) throw new Error();
                if (log.blockNumber < next.block || log.blockNumber === next.block && log.logIndex < next.logIndex) continue;
                if (events >= 100) return result();
                if (contractEvents >= eventShare || contractEvents > 0 && Date.now() >= contractDeadline) continue contracts;
                // A fractional share limits starting more work, never prevents one healthy event from completing.
                const verified = await transaction(log.transactionHash, log, deadline);
                if (Date.now() >= deadline) return result();
                if (verified.outcome !== "verified") throw new Error();
                const after = { block: log.blockNumber, logIndex: log.logIndex + 1 };
                if (!await repository.advance(config.chainId, address, next, after)) continue contracts;
                next = after;
                events++;
                contractEvents++;
              }
              if (Date.now() >= deadline) return result();
              const after = { block: end + 1n, logIndex: 0 };
              if (!await repository.advance(config.chainId, address, next, after)) break;
              next = after;
              ranges++;
              contractRanges++;
            }
          } catch { failed = true; }
        }
        return result();
      } catch { throw new ReconciliationError("RECONCILIATION_UNAVAILABLE"); }
    },
  };
}

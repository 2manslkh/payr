// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from "viem";
import { payrSettlementAbi } from "../chain/abi";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { PublicationAttempt } from "../invoices/publication-contracts";
import { createReconciler } from "./reconcile";
import type { ReconciliationConfig } from "./reconciliation-contracts";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const id = "00000000-0000-4000-8000-000000000001";
  const hash = `0x${"1".repeat(64)}` as const, commitment = `0x${"2".repeat(64)}` as const;
  const contract = `0x${"3".repeat(40)}` as const, payer = `0x${"4".repeat(40)}` as const;
  const snapshot = testPublicationSnapshot();
  const target: PublicationAttempt = { id, workspaceId: id, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1,
    invoiceNumber: "TEST-1", state: "finalized", snapshot, chainId: 5042002, contractAddress: contract, invoiceKey: hash,
    publicationSalt: hash, storageKey: "private.pdf", link: { tokenId: id, keyVersion: 1, verifierHash: "1".repeat(64),
      expiresAt: "2031-01-01T00:00:00Z", activatedAt: "2030-01-01T00:00:00Z", revokedAt: null },
    leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00Z",
    artifact: { pdfFilename: "test.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: hash,
      pdfContentHash: hash, documentCommitment: commitment, qrVerified: true } };
  const block = { hash, number: 100n, timestamp: 1893542400n };
  const receipt = { status: "success", transactionHash: hash, blockHash: hash, blockNumber: 100n, logs: [{
    address: contract, transactionHash: hash, blockHash: hash, blockNumber: 100n, logIndex: 0, removed: false,
    topics: encodeEventTopics({ abi: payrSettlementAbi, eventName: "InvoicePaid", args: { invoiceKey: hash, payer, payee: snapshot.sender.payoutWallet as `0x${string}` } }),
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [commitment, BigInt(snapshot.amountAtomic)]),
  }] } as unknown as TransactionReceipt;
  const chain = { chainId: vi.fn().mockResolvedValue(5042002), receipt: vi.fn().mockResolvedValue(receipt),
    block: vi.fn().mockResolvedValue(block), latest: vi.fn().mockResolvedValue(150n), transactions: vi.fn().mockResolvedValue([
      { address: contract, transactionHash: hash, blockHash: hash, blockNumber: 100n, logIndex: 0 },
    ]) };
  const repository = { findTarget: vi.fn().mockResolvedValue(target), recordSettlement: vi.fn().mockResolvedValue({ outcome: "recorded", settlementId: id, receiptDocumentId: id }),
    cursor: vi.fn().mockResolvedValue({ block: 100n, logIndex: 0 }), advance: vi.fn().mockResolvedValue(true) };
  const config: ReconciliationConfig = { chainId: 5042002, contractAddress: contract, contracts: [contract], startBlock: 100n,
    rpcUrl: "https://rpc.test", appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", activeKeyVersion: 1,
    keys: new Map([[1, new Uint8Array(32).fill(8)]]) };
  return { target, block, receipt, chain, repository, config, hash, service: createReconciler(chain, repository, config) };
}

it("records only chain-derived matching facts and atomically enqueues pending receipt work", async () => {
  const { service, repository, hash, block } = setup();
  expect(await service.transaction(hash)).toEqual({ outcome: "verified" });
  expect(repository.recordSettlement).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: hash,
    blockNumber: "100", blockTime: new Date(Number(block.timestamp) * 1000).toISOString(), amountAtomic: "1230000000000000000",
    deliveries: [{ messageKind: "receipt", normalizedRecipient: "client@example.test", roles: ["client"] },
      { messageKind: "receipt", normalizedRecipient: "owner@example.test", roles: ["issuer"] }] }));
});

it.each(["chain", "block", "value", "payee", "commitment", "logHash", "removed", "expired"])("rejects mismatched %s without settlement", async (kind) => {
  const { service, repository, chain, block, target, receipt, hash } = setup();
  if (kind === "chain") chain.chainId.mockResolvedValue(1);
  if (kind === "block") block.hash = `0x${"9".repeat(64)}`;
  if (kind === "value") target.snapshot.amountAtomic = "1";
  if (kind === "payee") Object.assign(target.snapshot.sender, { payoutWallet: `0x${"9".repeat(40)}` });
  if (kind === "commitment") target.artifact!.documentCommitment = hash;
  if (kind === "logHash") receipt.logs[0].transactionHash = `0x${"9".repeat(64)}`;
  if (kind === "removed") receipt.logs[0].removed = true;
  if (kind === "expired") block.timestamp = BigInt(Date.parse(target.snapshot.payableUntil) / 1000);
  await expect(service.transaction(hash)).rejects.toThrow();
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it("does not filter a valid late-discovered event by current link revocation or wall-clock expiry", async () => {
  const { service, target, repository, hash } = setup();
  target.link.revokedAt = "2030-01-03T00:00:00Z";
  target.link.expiresAt = "2030-01-04T00:00:00Z";
  await service.transaction(hash);
  expect(repository.recordSettlement).toHaveBeenCalledOnce();
});

it("returns pending for propagation and invalid for a reverted transaction", async () => {
  const { service, chain, receipt, hash, repository } = setup();
  chain.receipt.mockResolvedValueOnce(null);
  expect(await service.transaction(hash)).toEqual({ outcome: "pending" });
  receipt.status = "reverted";
  expect(await service.transaction(hash)).toEqual({ outcome: "invalid", reason: "reverted" });
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it("deduplicates receipt recipients and does not expose internal IDs", async () => {
  const { service, target, repository, hash } = setup();
  target.snapshot.client.contactEmail = target.snapshot.sender.contactEmail!;
  expect(await service.transaction(hash)).toEqual({ outcome: "verified" });
  expect(repository.recordSettlement.mock.calls[0][0].deliveries).toEqual([
    { messageKind: "receipt", normalizedRecipient: "owner@example.test", roles: ["issuer", "client"] },
  ]);
});

it("advances beyond a completed range and does not checkpoint a failed first event", async () => {
  const { service, repository, chain } = setup();
  await service.backfill(1);
  expect(chain.transactions).toHaveBeenCalledWith(expect.any(String), 100n, 150n);
  expect(repository.advance).toHaveBeenLastCalledWith(5042002, expect.any(String), { block: 100n, logIndex: 1 }, { block: 151n, logIndex: 0 });
  repository.advance.mockClear(); repository.recordSettlement.mockRejectedValue(new Error("database down"));
  await expect(service.backfill(1)).rejects.toThrow();
  expect(repository.advance).not.toHaveBeenCalled();
});

it("stops slow empty ranges at the deadline without starting another range or cursor write", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  const { service, chain, repository } = setup();
  chain.latest.mockResolvedValue(1_000_000n);
  chain.transactions.mockImplementation(async () => { now.mockReturnValue(240_000); return []; });
  expect(await service.backfill(50)).toEqual({ ranges: 0, events: 0 });
  expect(chain.transactions).toHaveBeenCalledOnce();
  expect(repository.advance).not.toHaveBeenCalled();
});

it("never advances past logs contradicted by a receipt", async () => {
  const { service, receipt, repository } = setup();
  const logs = receipt.logs;
  receipt.logs = [];
  await expect(service.backfill(1)).rejects.toThrow();
  expect(repository.advance).not.toHaveBeenCalled();
  receipt.logs = logs;
  await service.backfill(1);
  expect(repository.advance).toHaveBeenCalled();
});

it("makes durable intra-block progress across a dense range instead of starving it", async () => {
  const { service, receipt, repository, chain, target } = setup();
  const original = receipt.logs[0];
  receipt.logs = Array.from({ length: 1001 }, (_, logIndex) => ({ ...original, logIndex,
    topics: [original.topics[0], `0x${(logIndex + 1).toString(16).padStart(64, "0")}`, ...original.topics.slice(2)] as typeof original.topics }));
  chain.transactions.mockResolvedValue(receipt.logs);
  repository.findTarget.mockImplementation(async (_chain, _address, invoiceKey) => ({ ...target, invoiceKey }));
  const first = await service.backfill(1);
  expect(first.events).toBe(100);
  const position = repository.advance.mock.calls.at(-1)![3];
  expect(position).toEqual({ block: 100n, logIndex: 100 });
  repository.cursor.mockResolvedValue(position);
  repository.advance.mockClear();
  await service.backfill(1);
  expect(repository.advance.mock.calls.at(-1)![3]).toEqual({ block: 100n, logIndex: 200 });
});

it("never checkpoints a configured payment whose frozen invoice target is missing", async () => {
  const { service, repository } = setup();
  repository.findTarget.mockResolvedValue(null);
  await expect(service.backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.recordSettlement).not.toHaveBeenCalled();
  expect(repository.advance).not.toHaveBeenCalled();
});

it("does not use a different trusted contract's log to advance the requested cursor", async () => {
  const { service, repository, chain, receipt, target, config } = setup();
  const other = `0x${"a".repeat(40)}` as const;
  config.contracts.push(other);
  target.contractAddress = other;
  receipt.logs[0].address = other;
  chain.transactions.mockResolvedValue(receipt.logs);
  await expect(service.backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.advance.mock.calls.every(([, address]) => address !== config.contractAddress)).toBe(true);
});

it("bounds immediate reconciliation to 100 matching events and returns pending for the remainder", async () => {
  const { service, receipt, repository, hash } = setup();
  receipt.logs = Array.from({ length: 101 }, (_, logIndex) => ({ ...receipt.logs[0], logIndex }));
  expect(await service.transaction(hash)).toEqual({ outcome: "pending" });
  expect(repository.recordSettlement).toHaveBeenCalledTimes(100);
});

it("shares bounded ranges across current and retained contracts instead of exhausting them on the first", async () => {
  const { service, chain, config } = setup();
  const other = `0x${"a".repeat(40)}` as const;
  config.contracts.push(other);
  chain.latest.mockResolvedValue(100_000n);
  chain.transactions.mockResolvedValue([]);
  expect(await service.backfill(4)).toEqual({ ranges: 4, events: 0 });
  expect(chain.transactions.mock.calls.map(([address]) => address)).toEqual([
    config.contractAddress, config.contractAddress, other, other,
  ]);
});

it("rejects trailing event data rather than accepting a non-exact InvoicePaid encoding", async () => {
  const { service, receipt, repository, hash } = setup();
  receipt.logs[0].data = `${receipt.logs[0].data}00`;
  await expect(service.transaction(hash)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it.each(["old block", "future block", "negative log", "oversized log"])("does not checkpoint an out-of-range RPC result: %s", async (kind) => {
  const { service, chain, receipt, repository } = setup();
  const log = { ...receipt.logs[0] };
  if (kind === "old block") log.blockNumber = 99n;
  if (kind === "future block") log.blockNumber = 151n;
  if (kind === "negative log") log.logIndex = -1;
  if (kind === "oversized log") log.logIndex = 2147483647;
  chain.transactions.mockResolvedValue([log]);
  await expect(service.backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.advance).not.toHaveBeenCalled();
});

it.each(["latest", "transactions", "cursor", "advance"])("redacts %s failures at the backfill boundary", async (kind) => {
  const { service, chain, repository } = setup();
  const failure = new Error("private provider detail");
  if (kind === "latest") chain.latest.mockRejectedValue(failure);
  if (kind === "transactions") chain.transactions.mockRejectedValue(failure);
  if (kind === "cursor") repository.cursor.mockRejectedValue(failure);
  if (kind === "advance") repository.advance.mockRejectedValue(failure);
  await expect(service.backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
});

it("retains a verified prefix after the second event fails and resumes the unverified event after restart", async () => {
  const { service, chain, repository, receipt, target, config } = setup();
  const secondKey = `0x${"9".repeat(64)}` as const;
  receipt.logs.push({ ...receipt.logs[0], logIndex: 1,
    topics: [receipt.logs[0].topics[0], secondKey, ...receipt.logs[0].topics.slice(2)] as typeof receipt.logs[0]["topics"] });
  chain.transactions.mockResolvedValue(receipt.logs);
  repository.findTarget.mockImplementation(async (_chain, _address, invoiceKey) => ({ ...target, invoiceKey }));
  repository.recordSettlement.mockResolvedValueOnce({ outcome: "recorded" }).mockRejectedValueOnce(new Error("database unavailable"));
  await expect(service.backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.advance).toHaveBeenCalledExactlyOnceWith(5042002, config.contractAddress,
    { block: 100n, logIndex: 0 }, { block: 100n, logIndex: 1 });
  repository.cursor.mockResolvedValue({ block: 100n, logIndex: 1 });
  repository.advance.mockClear();
  repository.recordSettlement.mockClear();
  expect(await createReconciler(chain, repository, config).backfill(1)).toEqual({ ranges: 1, events: 1 });
  expect(repository.recordSettlement).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceKey: secondKey, logIndex: 1 }));
  expect(repository.advance).toHaveBeenLastCalledWith(5042002, config.contractAddress, { block: 100n, logIndex: 2 }, { block: 151n, logIndex: 0 });
});

it("stops on a lost cursor compare-and-set after recording and lets another run safely replay", async () => {
  const { service, repository } = setup();
  repository.advance.mockResolvedValue(false);
  expect(await service.backfill(1)).toEqual({ ranges: 0, events: 0 });
  expect(repository.recordSettlement).toHaveBeenCalledOnce();
  expect(repository.advance).toHaveBeenCalledOnce();
});

it.each(["chain", "receipt", "block", "target"])("does not start more work when %s retrieval reaches the deadline", async (kind) => {
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  const { service, chain, block, receipt, target, repository, hash } = setup();
  const expire = <T>(value: T) => async () => { now.mockReturnValue(240_000); return value; };
  if (kind === "chain") chain.chainId.mockImplementation(expire(5042002));
  if (kind === "receipt") chain.receipt.mockImplementation(expire(receipt));
  if (kind === "block") chain.block.mockImplementation(expire(block));
  if (kind === "target") repository.findTarget.mockImplementation(expire(target));
  expect(await service.transaction(hash)).toEqual({ outcome: "pending" });
  expect(repository.recordSettlement).not.toHaveBeenCalled();
  if (kind === "chain") expect(chain.receipt).not.toHaveBeenCalled();
  if (kind === "receipt") expect(chain.block).not.toHaveBeenCalled();
  if (kind === "block") expect(repository.findTarget).not.toHaveBeenCalled();
});

it.each(["unknown", "wrong topic", "foreign contract"])("does not manufacture settlement for %s immediate input", async (kind) => {
  const { service, receipt, repository, hash } = setup();
  if (kind === "unknown") repository.findTarget.mockResolvedValue(null);
  if (kind === "wrong topic") receipt.logs[0].topics[0] = `0x${"0".repeat(64)}`;
  if (kind === "foreign contract") receipt.logs[0].address = `0x${"0".repeat(40)}`;
  expect(await service.transaction(hash)).toEqual({ outcome: "invalid" });
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it("does not infer a receipt recipient from malformed frozen email data", async () => {
  const { service, target, repository, hash } = setup();
  target.snapshot.client.contactEmail = "not-an-address";
  await expect(service.transaction(hash)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it("prioritizes the lagging retained cursor on the next fresh invocation", async () => {
  const { service, chain, config, repository } = setup();
  const other = `0x${"a".repeat(40)}` as const;
  config.contracts.push(other);
  chain.latest.mockResolvedValue(100_000n);
  chain.transactions.mockResolvedValue([]);
  await service.backfill(1);
  repository.cursor.mockImplementation(async (_chain, address) => ({ block: address === other ? 100n : 10100n, logIndex: 0 }));
  await createReconciler(chain, repository, config).backfill(1);
  expect(chain.transactions.mock.calls.map(([address]) => address)).toEqual([config.contractAddress, other]);
});

it("allows a healthy contract to progress across fresh runs despite a persistently blocked retained contract", async () => {
  const { service, chain, receipt, config, repository } = setup();
  const healthy = `0x${"a".repeat(40)}` as const;
  config.contracts.push(healthy);
  repository.findTarget.mockResolvedValue(null);
  chain.transactions.mockImplementation(async (address) => address === healthy ? [] : receipt.logs);
  await expect(service.backfill(2)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.advance).toHaveBeenCalledExactlyOnceWith(5042002, healthy,
    { block: 100n, logIndex: 0 }, { block: 151n, logIndex: 0 });
  repository.cursor.mockImplementation(async (_chain, address) => ({ block: address === healthy ? 151n : 100n, logIndex: 0 }));
  chain.latest.mockResolvedValue(250n);
  await expect(createReconciler(chain, repository, config).backfill(2)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(repository.advance).toHaveBeenLastCalledWith(5042002, healthy, { block: 151n, logIndex: 0 }, { block: 251n, logIndex: 0 });
  expect(repository.recordSettlement).not.toHaveBeenCalled();
});

it("makes durable progress when one healthy event exceeds a contract's fractional time share", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const { chain, receipt, target, config, repository } = setup();
  config.contracts = [config.contractAddress, ...Array.from({ length: 20 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}` as const)];
  const positions = new Map<string, { block: bigint; logIndex: number }>();
  let address = config.contractAddress;
  chain.chainId.mockImplementation(async () => { now += 2000; return 5042002; });
  repository.cursor.mockImplementation(async (_chain, contract) => { now += 2000; return positions.get(contract) ?? { block: 100n, logIndex: 0 }; });
  chain.transactions.mockImplementation(async (contract) => { now += 2000; address = contract; return [{ ...receipt.logs[0], address }]; });
  chain.receipt.mockImplementation(async () => { now += 2000; return { ...receipt, logs: [{ ...receipt.logs[0], address }] }; });
  chain.block.mockImplementation(async () => { now += 2000; return { hash: receipt.blockHash, number: 100n, timestamp: 1893542400n }; });
  repository.findTarget.mockImplementation(async () => { now += 2000; return { ...target, contractAddress: address }; });
  repository.recordSettlement.mockImplementation(async () => { now += 2000; return { outcome: "recorded" }; });
  repository.advance.mockImplementation(async (_chain, contract, _expected, next) => { now += 2000; positions.set(contract, next); return true; });
  await createReconciler(chain, repository, config).backfill(50);
  expect(repository.recordSettlement.mock.calls.length).toBeGreaterThan(0);
  await createReconciler(chain, repository, config).backfill(50);
  expect(positions.size).toBe(21);
});

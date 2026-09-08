// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { TransactionReceiptNotFoundError } from "viem";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { createReconciliationRuntime } from "./reconciliation-runtime";

const mocks = vi.hoisted(() => ({ client: { getChainId: vi.fn(), getBlockNumber: vi.fn(), getLogs: vi.fn(),
  getTransactionReceipt: vi.fn(), getBlock: vi.fn() }, rpc: vi.fn(), abort: vi.fn() }));
vi.mock("../../config/env", () => ({ createReconciliationEnv: () => ({
  chainId: 5042002, contractAddress: `0x${"3".repeat(40)}`, contracts: [`0x${"3".repeat(40)}`], startBlock: 0n,
  rpcUrl: "https://rpc.test", appOrigin: "https://example.test", explorerOrigin: "https://explorer.test",
  activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(8)]]),
}) }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => mocks.client }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
beforeEach(() => {
  for (const mock of [...Object.values(mocks.client), mocks.rpc, mocks.abort]) mock.mockReset();
  mocks.client.getChainId.mockResolvedValue(5042002);
  mocks.client.getBlockNumber.mockResolvedValue(0n);
  mocks.client.getLogs.mockResolvedValue([]);
  mocks.rpc.mockImplementation((name: string) => ({ abortSignal: (signal: AbortSignal) => {
    mocks.abort(signal);
    return Promise.resolve({ data: name === "payr_reconciliation_position_v1" ? { block: "0", logIndex: 0 } : true, error: null });
  } }));
});

it("bounds every real repository request with an abort signal while reconciling an empty range", async () => {
  expect(await createReconciliationRuntime().backfill(1)).toEqual({ ranges: 1, events: 0 });
  expect(mocks.abort).toHaveBeenCalledTimes(2);
  for (const [signal] of mocks.abort.mock.calls) expect(signal).toBeInstanceOf(AbortSignal);
});

it("treats only the provider's receipt-not-found error as pending", async () => {
  const hash = `0x${"1".repeat(64)}` as const;
  mocks.client.getTransactionReceipt.mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash }))
    .mockRejectedValueOnce(new Error("private provider details"));
  expect(await createReconciliationRuntime().transaction(hash)).toEqual({ outcome: "pending" });
  await expect(createReconciliationRuntime().transaction(hash)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("does not advance when the provider cannot return committed log coordinates", async () => {
  mocks.client.getLogs.mockResolvedValue([{ removed: true }]);
  await expect(createReconciliationRuntime().backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("preserves valid/malformed/valid RPC candidates and never checkpoints past the malformed event", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  const id = "00000000-0000-4000-8000-000000000001";
  const hash = `0x${"1".repeat(64)}` as const, contract = `0x${"3".repeat(40)}` as const;
  const snapshot = testPublicationSnapshot();
  const logs = Array.from({ length: 3 }, (_, index) => ({ address: contract, blockHash: hash, blockNumber: "0x64" as const,
    transactionHash: hash, transactionIndex: "0x0" as const, logIndex: actual.toHex(index), removed: false,
    topics: [actual.toEventSelector("InvoicePaid(bytes32,bytes32,address,address,uint256)"), actual.toHex(index + 1, { size: 32 }),
      actual.pad(`0x${"4".repeat(40)}`), actual.pad(snapshot.sender.payoutWallet as `0x${string}`)] as [`0x${string}`, ...`0x${string}`[]],
    data: index === 1 ? "0x" as const : actual.encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [hash, BigInt(snapshot.amountAtomic)]),
  }));
  const rpc = actual.createPublicClient({ transport: actual.custom({ request: async () => logs }) });
  mocks.client.getLogs.mockImplementation((params) => rpc.getLogs(params));
  mocks.client.getBlockNumber.mockResolvedValue(100n);
  mocks.client.getTransactionReceipt.mockResolvedValue({ status: "success", transactionHash: hash, blockNumber: 100n, blockHash: hash,
    logs: logs.map((log) => actual.formatLog(log)) });
  mocks.client.getBlock.mockResolvedValue({ number: 100n, hash, timestamp: 1893542400n });
  mocks.rpc.mockImplementation((name, args) => ({ abortSignal: () => Promise.resolve({ error: null, data:
    name === "payr_reconciliation_position_v1" ? { block: "100", logIndex: 0 }
      : name === "payr_record_settlement_v1" ? [{ outcome: "recorded", settlement_id: id, receipt_document_id: id }]
        : name === "payr_reconciliation_target_v1" ? { id, workspaceId: id, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1,
          invoiceNumber: "INV-2030-000001", state: "finalized", snapshot, chainId: 5042002, contractAddress: contract,
          invoiceKey: args.p_invoice_key, publicationSalt: hash, storageKey: `workspace/${id}/invoice/${id}/1/attempt/${id}.pdf`,
          link: { tokenId: id, keyVersion: 1, verifierHash: "1".repeat(64), expiresAt: "2031-01-01T00:00:00Z", activatedAt: "2030-01-01T00:00:00Z", revokedAt: null },
          leaseOwner: id, leaseUntil: "2031-01-01T00:00:00Z", fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00Z",
          artifact: { pdfFilename: "invoice.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true } }
          : true }) }));
  await expect(createReconciliationRuntime().backfill(1)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  const advances = mocks.rpc.mock.calls.filter(([name]) => name === "payr_advance_reconciliation_position_v1");
  expect(advances).toHaveLength(1);
  expect(advances[0][1]).toMatchObject({ p_next: "100", p_next_log: 1 });
});

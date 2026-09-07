// @vitest-environment node
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, parseTransaction, type PublicClient, type WalletClient, type Account, type Chain, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./arc";
import { submitOperatorPayment, verifyOperatorPayment } from "./operator-payment";
import { payrSettlementAbi } from "./abi";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const directories: string[] = [];
afterEach(async () => {
  vi.mocked(open).mockReset();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "payr-operator-test-"));
  directories.push(directory);
  const journalPath = join(directory, "payment.json");
  const account = privateKeyToAccount(`0x${"0".repeat(63)}2`);
  const payment = {
    authorizationId: "11111111-1111-4111-8111-111111111111",
    contractAddress: `0x${"2".repeat(40)}` as const,
    message: { invoiceKey: `0x${"3".repeat(64)}` as const, documentCommitment: `0x${"4".repeat(64)}` as const,
      payee: `0x${"5".repeat(40)}` as const, amount: 1_000_000_000_000_000_000n,
      authorizationValidUntil: 1600n, payableUntil: 2000n },
    signature: `0x${"6".repeat(130)}` as const,
  };
  const client = {
    getChainId: vi.fn().mockResolvedValue(5042002), simulateContract: vi.fn().mockResolvedValue({}),
    estimateContractGas: vi.fn().mockResolvedValue(100_000n),
    estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }),
    getBalance: vi.fn().mockResolvedValue(20_000_000_000_000_000_000n),
    getBlock: vi.fn().mockResolvedValue({ number: 42n, hash: `0x${"7".repeat(64)}` }),
  };
  const wallet = {
    account, chain: arcTestnet,
    prepareTransactionRequest: vi.fn(async (request) => ({ ...request, chainId: 5042002, nonce: 7 })),
    signTransaction: vi.fn((request) => account.signTransaction(request)),
    sendRawTransaction: vi.fn(async ({ serializedTransaction }) => keccak256(serializedTransaction)),
  };
  const submit = () => submitOperatorPayment(client as unknown as PublicClient,
    wallet as unknown as WalletClient<Transport, Chain, Account>, { journalPath, payment });
  return { journalPath, payment, client, wallet, submit };
}

it("durably retains a secret-free transaction identity before an accepted broadcast times out", async () => {
  const { journalPath, payment, wallet, submit } = await setup();
  wallet.sendRawTransaction.mockImplementationOnce(async ({ serializedTransaction }) => {
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    expect(journal.transactionHash).toBe(keccak256(serializedTransaction));
    expect(journal.nonce).toBe(7);
    expect(journal.authorizationId).toBe(payment.authorizationId);
    expect((await stat(journalPath)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(journal)).not.toContain(payment.signature);
    expect(JSON.stringify(journal)).not.toContain(serializedTransaction);
    throw new Error("RPC accepted transaction but response timed out");
  });
  await expect(submit()).rejects.toThrow();
  expect(wallet.sendRawTransaction).toHaveBeenCalledOnce();
  const original = await readFile(journalPath, "utf8");
  await expect(submit()).rejects.toThrow();
  expect(wallet.sendRawTransaction).toHaveBeenCalledOnce();
  expect(await readFile(journalPath, "utf8")).toBe(original);
});

it.each(["valid", "wrong chain", "wrong configured contract", "reverted", "wrong transaction", "wrong calldata",
  "wrong payer", "wrong value", "wrong nonce", "wrong commitment", "wrong event amount", "duplicate event",
  "removed log", "wrong block", "reorg", "payment block reorg", "payment block reorg during balances",
  "nonzero contract balance", "concurrent payee activity", "pending receipt", "corrupt journal"])(
  "recovery is read-only and verifies %s", async (kind) => {
  const { journalPath, payment, wallet, client, submit } = await setup();
  const journal = await submit();
  const signed = await wallet.signTransaction.mock.results[0].value;
  const transaction = parseTransaction(signed);
  const blockHash = `0x${"8".repeat(64)}` as const;
  const receipt = { status: "success", transactionHash: journal.transactionHash, blockNumber: 43n, blockHash,
    logs: [{ address: payment.contractAddress, transactionHash: journal.transactionHash, blockHash, blockNumber: 43n,
      logIndex: 0, removed: false,
      topics: encodeEventTopics({ abi: payrSettlementAbi, eventName: "InvoicePaid",
        args: { invoiceKey: payment.message.invoiceKey, payer: wallet.account.address, payee: payment.message.payee } }),
      data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [payment.message.documentCommitment, payment.message.amount]),
    }] };
  const readClient = { ...client,
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getTransaction: vi.fn().mockResolvedValue({ ...transaction, hash: journal.transactionHash, blockHash,
      from: wallet.account.address, input: transaction.data }),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: blockNumber === 43n ? blockHash : journal.beforeBlockHash })),
    getBalance: vi.fn(async ({ address, blockNumber }) => address === payment.contractAddress ? 0n
      : BigInt(journal.payeeBalanceBefore) + (blockNumber === 43n ? payment.message.amount : 0n)),
  };
  const originalTransaction = await readClient.getTransaction();
  if (kind === "wrong chain") readClient.getChainId.mockResolvedValue(1);
  if (kind === "reverted") receipt.status = "reverted";
  if (kind === "wrong transaction") readClient.getTransaction.mockResolvedValue({ ...originalTransaction, hash: payment.message.invoiceKey });
  if (kind === "wrong calldata") readClient.getTransaction.mockResolvedValue({ ...originalTransaction, input: "0x" });
  if (kind === "wrong payer") readClient.getTransaction.mockResolvedValue({ ...originalTransaction, from: payment.message.payee });
  if (kind === "wrong value") readClient.getTransaction.mockResolvedValue({ ...originalTransaction, value: 1n });
  if (kind === "wrong nonce") readClient.getTransaction.mockResolvedValue({ ...originalTransaction, nonce: 8 });
  if (kind === "wrong commitment") receipt.logs[0].data = encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [payment.message.invoiceKey, payment.message.amount]);
  if (kind === "wrong event amount") receipt.logs[0].data = encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [payment.message.documentCommitment, 1n]);
  if (kind === "duplicate event") receipt.logs.push(receipt.logs[0]);
  if (kind === "removed log") receipt.logs[0].removed = true;
  if (kind === "wrong block") receipt.logs[0].blockNumber = 44n;
  if (kind === "reorg") readClient.getBlock.mockResolvedValue({ number: 42n, hash: blockHash });
  if (kind === "payment block reorg" || kind === "payment block reorg during balances") {
    let paymentBlockReads = 0;
    readClient.getBlock.mockImplementation(async ({ blockNumber }) => ({ number: blockNumber,
      hash: blockNumber === 43n && (kind === "payment block reorg" || ++paymentBlockReads > 1)
        ? payment.message.invoiceKey : blockNumber === 43n ? blockHash : journal.beforeBlockHash }));
  }
  if (kind === "nonzero contract balance" || kind === "concurrent payee activity") {
    readClient.getBalance.mockImplementation(async ({ address, blockNumber }) => address === payment.contractAddress
      ? (kind === "nonzero contract balance" ? 1n : 0n)
      : BigInt(journal.payeeBalanceBefore) + (blockNumber === 43n ? payment.message.amount + 1n : 0n));
  }
  if (kind === "pending receipt") readClient.getTransactionReceipt.mockRejectedValue(new Error("Not mined yet"));
  if (kind === "corrupt journal") await writeFile(journalPath, "{partial");
  const recovery = verifyOperatorPayment(readClient as unknown as PublicClient, journalPath,
    kind === "wrong configured contract" ? payment.message.payee : payment.contractAddress);
  if (kind === "valid") {
    expect(await recovery).toEqual({ transactionHash: journal.transactionHash, blockNumber: "43", logIndex: 0, authorizationId: payment.authorizationId });
    expect(readClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: journal.transactionHash });
  } else { await expect(recovery).rejects.toThrow(); }
  expect(wallet.sendRawTransaction).toHaveBeenCalledOnce();
  expect(wallet.signTransaction).toHaveBeenCalledOnce();
});

it.each(["wrong chain", "gas budget exceeded", "insufficient gas reserve", "simulation failure", "signing failure", "journal unavailable"])("never broadcasts on %s", async (kind) => {
  const { journalPath, client, wallet, submit } = await setup();
  if (kind === "wrong chain") client.getChainId.mockResolvedValue(1);
  if (kind === "gas budget exceeded") client.estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 1_000_000_000_001n, maxPriorityFeePerGas: 1n });
  if (kind === "insufficient gas reserve") client.getBalance.mockResolvedValue(1_000_000_000_000_000_000n);
  if (kind === "simulation failure") client.simulateContract.mockRejectedValue(new Error("Reverted"));
  if (kind === "signing failure") wallet.signTransaction.mockRejectedValue(new Error("Denied"));
  if (kind === "journal unavailable") await writeFile(journalPath, "existing evidence");
  await expect(submit()).rejects.toThrow();
  expect(wallet.sendRawTransaction).not.toHaveBeenCalled();
});

it("allows only one competing invocation to broadcast and retains its identity", async () => {
  const { wallet, journalPath, submit } = await setup();
  const results = await Promise.allSettled([submit(), submit()]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(wallet.sendRawTransaction).toHaveBeenCalledOnce();
  expect(JSON.parse(await readFile(journalPath, "utf8")).transactionHash)
    .toBe(await wallet.sendRawTransaction.mock.results[0].value);
});

it("retains the local identity if the RPC returns a different hash", async () => {
  const { wallet, journalPath, submit } = await setup();
  wallet.sendRawTransaction.mockResolvedValue(`0x${"f".repeat(64)}`);
  await expect(submit()).rejects.toThrow("Broadcast identity mismatch");
  expect(JSON.parse(await readFile(journalPath, "utf8")).transactionHash).not.toBe(`0x${"f".repeat(64)}`);
});

it.each(["write", "file sync", "file close", "directory open", "directory sync", "directory close"])(
  "never broadcasts when durable journal persistence fails at %s", async (kind) => {
    const { submit, wallet } = await setup();
    const file = { writeFile: vi.fn().mockResolvedValue(undefined), sync: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const directory = { sync: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    if (kind === "write") file.writeFile.mockRejectedValue(new Error("Disk failure"));
    if (kind === "file sync") file.sync.mockRejectedValue(new Error("Disk failure"));
    if (kind === "file close") file.close.mockRejectedValue(new Error("Disk failure"));
    if (kind === "directory sync") directory.sync.mockRejectedValue(new Error("Disk failure"));
    if (kind === "directory close") directory.close.mockRejectedValue(new Error("Disk failure"));
    vi.mocked(open).mockResolvedValueOnce(file as unknown as Awaited<ReturnType<typeof open>>);
    if (kind === "directory open") vi.mocked(open).mockRejectedValueOnce(new Error("Disk failure"));
    else vi.mocked(open).mockResolvedValueOnce(directory as unknown as Awaited<ReturnType<typeof open>>);
    await expect(submit()).rejects.toThrow("Disk failure");
    expect(wallet.sendRawTransaction).not.toHaveBeenCalled();
  },
);

it("waits for both file and directory synchronization before broadcasting", async () => {
  const { submit, wallet } = await setup();
  let finishFileSync!: () => void;
  let finishDirectorySync!: () => void;
  const fileSynced = new Promise<void>((resolve) => { finishFileSync = resolve; });
  const directorySynced = new Promise<void>((resolve) => { finishDirectorySync = resolve; });
  const file = { writeFile: vi.fn().mockResolvedValue(undefined), sync: vi.fn(() => fileSynced), close: vi.fn().mockResolvedValue(undefined) };
  const directory = { sync: vi.fn(() => directorySynced), close: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(open).mockResolvedValueOnce(file as unknown as Awaited<ReturnType<typeof open>>)
    .mockResolvedValueOnce(directory as unknown as Awaited<ReturnType<typeof open>>);
  const pending = submit();
  await vi.waitFor(() => expect(file.sync).toHaveBeenCalledOnce());
  expect(wallet.sendRawTransaction).not.toHaveBeenCalled();
  finishFileSync();
  await vi.waitFor(() => expect(directory.sync).toHaveBeenCalledOnce());
  expect(wallet.sendRawTransaction).not.toHaveBeenCalled();
  finishDirectorySync();
  await pending;
  expect(wallet.sendRawTransaction).toHaveBeenCalledOnce();
});

it.each([undefined, "1"])("the actual CLI requires interactive approval even with RUN_LIVE_ARC_PAYMENT=%s", (guard) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/operator-pay.ts"], {
    cwd: process.cwd(), encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test", ...(guard ? { RUN_LIVE_ARC_PAYMENT: guard } : {}) },
    timeout: 10_000,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Operator payment stopped");
  expect(result.stderr).not.toContain("PRIVATE_KEY");
});

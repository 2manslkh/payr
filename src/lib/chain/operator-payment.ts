import { open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { decodeEventLog, encodeFunctionData, keccak256, type Account, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { z } from "zod";
import type { paymentTypedData } from "../domain/payment-authorization";
import { payrSettlementAbi } from "./abi";
import { arcTestnet } from "./arc";

type OperatorPayment = {
  authorizationId: string;
  contractAddress: Hex;
  message: ReturnType<typeof paymentTypedData>["message"];
  signature: Hex;
};

export async function submitOperatorPayment(
  client: PublicClient,
  wallet: WalletClient<Transport, Chain, Account>,
  { journalPath, payment }: { journalPath: string; payment: OperatorPayment },
) {
  if (await client.getChainId() !== arcTestnet.id || wallet.chain.id !== arcTestnet.id
    || wallet.account.type !== "local") throw new Error("Use a local Arc testnet operator");
  const { message } = payment;
  const args = [message.invoiceKey, message.documentCommitment, message.payee, message.amount,
    message.authorizationValidUntil, message.payableUntil, payment.signature] as const;
  const call = { account: wallet.account, address: payment.contractAddress, abi: payrSettlementAbi,
    functionName: "payInvoice" as const, args, value: message.amount };
  await client.simulateContract(call);
  const gas = await client.estimateContractGas(call);
  const fees = await client.estimateFeesPerGas();
  if (gas * fees.maxFeePerGas > 100_000_000_000_000_000n) throw new Error("Operator gas budget exceeds 0.1 testnet USDC");
  if (await client.getBalance({ address: wallet.account.address }) < message.amount + gas * fees.maxFeePerGas) {
    throw new Error("Insufficient payment plus gas reserve");
  }
  const before = await client.getBlock();
  const payeeBalanceBefore = await client.getBalance({ address: message.payee, blockNumber: before.number });
  const data = encodeFunctionData({ abi: payrSettlementAbi, functionName: "payInvoice", args });
  const request = await wallet.prepareTransactionRequest({ account: wallet.account, to: payment.contractAddress,
    data, value: message.amount, gas, maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: "eip1559" });
  const serializedTransaction = await wallet.signTransaction(request);
  const transactionHash = keccak256(serializedTransaction);
  const journal = {
    schemaVersion: "payr.operator-payment.v1", chainId: arcTestnet.id,
    transactionHash, nonce: request.nonce, calldataHash: keccak256(data),
    authorizationId: payment.authorizationId, contractAddress: payment.contractAddress,
    payer: wallet.account.address, payee: message.payee, amountAtomic: message.amount.toString(),
    invoiceKey: message.invoiceKey, documentCommitment: message.documentCommitment,
    beforeBlockNumber: before.number.toString(), beforeBlockHash: before.hash,
    payeeBalanceBefore: payeeBalanceBefore.toString(),
  };
  // Exclusive creation also serializes competing invocations. Never erase this recovery record.
  const file = await open(journalPath, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(journal, null, 2)}\n`, "utf8");
    await file.sync();
  } finally { await file.close(); }
  const directory = await open(dirname(journalPath), "r");
  try { await directory.sync(); } finally { await directory.close(); }
  const returnedHash = await wallet.sendRawTransaction({ serializedTransaction });
  if (returnedHash.toLowerCase() !== transactionHash) throw new Error("Broadcast identity mismatch; recover from journal");
  return journal;
}

export async function verifyOperatorPayment(client: PublicClient, journalPath: string, expectedContract: Hex) {
  const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hex);
  const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value.toLowerCase() as Hex);
  const integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
  const journal = z.object({
    schemaVersion: z.literal("payr.operator-payment.v1"), chainId: z.literal(5042002),
    transactionHash: hash, nonce: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), calldataHash: hash,
    authorizationId: z.string().uuid(), contractAddress: address, payer: address, payee: address,
    amountAtomic: integer.refine((value) => BigInt(value) > 0n), invoiceKey: hash, documentCommitment: hash,
    beforeBlockNumber: integer, beforeBlockHash: hash, payeeBalanceBefore: integer,
  }).strict().parse(JSON.parse(await readFile(journalPath, "utf8")));
  if (await client.getChainId() !== journal.chainId || journal.contractAddress !== expectedContract.toLowerCase()) {
    throw new Error("Recovery chain or contract mismatch");
  }
  const receipt = await client.getTransactionReceipt({ hash: journal.transactionHash });
  const transaction = await client.getTransaction({ hash: journal.transactionHash });
  if (receipt.status !== "success" || receipt.transactionHash !== journal.transactionHash
    || transaction.hash !== journal.transactionHash || transaction.blockHash !== receipt.blockHash
    || transaction.chainId !== journal.chainId || transaction.nonce !== journal.nonce
    || transaction.from.toLowerCase() !== journal.payer || transaction.to?.toLowerCase() !== journal.contractAddress
    || transaction.value !== BigInt(journal.amountAtomic) || keccak256(transaction.input) !== journal.calldataHash) {
    throw new Error("Payment transaction mismatch");
  }
  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === journal.contractAddress);
  if (logs.length !== 1) throw new Error("Unexpected settlement logs");
  const log = logs[0];
  if (log.removed || log.logIndex === null || log.blockHash !== receipt.blockHash
    || log.blockNumber !== receipt.blockNumber || log.transactionHash !== journal.transactionHash) {
    throw new Error("Settlement log identity mismatch");
  }
  const event = decodeEventLog({ abi: payrSettlementAbi, eventName: "InvoicePaid", data: log.data, topics: log.topics, strict: true });
  if (event.args.invoiceKey !== journal.invoiceKey || event.args.documentCommitment !== journal.documentCommitment
    || event.args.payee.toLowerCase() !== journal.payee || event.args.payer.toLowerCase() !== journal.payer
    || event.args.amount !== BigInt(journal.amountAtomic)) throw new Error("Settlement event mismatch");
  const beforeBlockNumber = BigInt(journal.beforeBlockNumber);
  const before = await client.getBlock({ blockNumber: beforeBlockNumber });
  if (before.hash !== journal.beforeBlockHash || beforeBlockNumber >= receipt.blockNumber) {
    throw new Error("Pre-payment block evidence changed");
  }
  if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) {
    throw new Error("Payment block evidence changed");
  }
  const [contractBalance, payeeBefore, payeeAfter] = await Promise.all([
    client.getBalance({ address: journal.contractAddress, blockNumber: receipt.blockNumber }),
    client.getBalance({ address: journal.payee, blockNumber: beforeBlockNumber }),
    client.getBalance({ address: journal.payee, blockNumber: receipt.blockNumber }),
  ]);
  if (contractBalance !== 0n || payeeBefore !== BigInt(journal.payeeBalanceBefore)
    || payeeAfter - payeeBefore !== BigInt(journal.amountAtomic)) {
    throw new Error("Balance evidence needs operator investigation of concurrent activity");
  }
  // Number-based balance reads must still belong to the receipt's canonical block.
  if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) {
    throw new Error("Payment block evidence changed during read-back");
  }
  return { transactionHash: journal.transactionHash, blockNumber: receipt.blockNumber.toString(),
    logIndex: log.logIndex, authorizationId: journal.authorizationId };
}

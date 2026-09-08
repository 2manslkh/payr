import { createPublicClient, decodeEventLog, http, TransactionNotFoundError, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { getWalletClient } from "wagmi/actions";
import type { Config } from "wagmi";
import { arcTestnet } from "../chain/arc";
import { payrSettlementAbi } from "../chain/abi";
import { PaymentError, type PaymentSetup } from "./payment-contracts";
import type { AuthorizedPayment, PaymentAdapter } from "./pay";

export type SubmissionIdentity = { from: Address; nonce: number; firstBlock: string };

export async function locateReplacement(identity: SubmissionIdentity, latest: bigint,
  nonceAt: (block: bigint) => Promise<number>, transactions: (block: bigint) => Promise<Array<{ from: Address; nonce: number; hash: Hex }>>) {
  if (await nonceAt(latest) <= identity.nonce) return null;
  let low = BigInt(identity.firstBlock), high = latest;
  if (low > high) throw new Error("Invalid recovery position");
  if (await nonceAt(low) > identity.nonce) low = 0n;
  while (low < high) {
    const middle = (low + high) / 2n;
    if (await nonceAt(middle) > identity.nonce) high = middle;
    else low = middle + 1n;
  }
  return (await transactions(high)).find((tx) => tx.from.toLowerCase() === identity.from.toLowerCase() && tx.nonce === identity.nonce)?.hash ?? null;
}

export async function watchPaymentReplacement(setup: PaymentSetup, hash: Hex, signal: AbortSignal,
  replaced: (hash: Hex, cancelled: boolean) => void, confirmed: () => void) {
  const client = createPublicClient({ chain: arcTestnet, transport: http(setup.rpcUrl, { retryCount: 0, timeout: 15_000 }) });
  const key = `payr:submission:${hash}`;
  let identity: SubmissionIdentity | null = null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (stored && /^0x[0-9a-fA-F]{40}$/.test(stored.from) && Number.isSafeInteger(stored.nonce) && stored.nonce >= 0
      && /^(0|[1-9][0-9]*)$/.test(stored.firstBlock)) identity = stored;
  } catch { /* Recovery still works when the original transaction is discoverable. */ }
  if (await client.getChainId() !== 5042002) throw new PaymentError("WRONG_NETWORK");
  for (let attempt = 0; attempt < 23 && !signal.aborted; attempt++) {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt.status !== "success" || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) return;
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash || block.number !== receipt.blockNumber || block.timestamp < 0n
        || block.timestamp >= BigInt(Date.parse(setup.payableUntil) / 1000)) return;
      const matching = receipt.logs.some((log) => {
        if (log.removed || log.address.toLowerCase() !== setup.contractAddress.toLowerCase()
          || log.transactionHash !== receipt.transactionHash || log.blockHash !== block.hash || log.blockNumber !== block.number
          || log.topics.length !== 4 || !/^0x[0-9a-fA-F]{128}$/.test(log.data)) return false;
        try {
          const { args } = decodeEventLog({ abi: payrSettlementAbi, eventName: "InvoicePaid", topics: log.topics, data: log.data, strict: true });
          return args.invoiceKey.toLowerCase() === setup.invoiceKey.toLowerCase()
            && args.documentCommitment.toLowerCase() === setup.documentCommitment.toLowerCase()
            && args.payee.toLowerCase() === setup.payee.toLowerCase() && args.amount === BigInt(setup.amountAtomic);
        } catch { return false; }
      });
      // Chain evidence drives only the intermediate state. The server alone records Paid.
      if (matching && !signal.aborted) confirmed();
      return;
    }
    catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
    const latest = await client.getBlockNumber({ cacheTime: 0 });
    if (!identity) {
      try {
        const tx = await client.getTransaction({ hash });
        identity = { from: tx.from, nonce: tx.nonce, firstBlock: (tx.blockNumber === null ? latest : tx.blockNumber > 0n ? tx.blockNumber - 1n : 0n).toString() };
        try { sessionStorage.setItem(key, JSON.stringify(identity)); } catch { /* Memory-only recovery until reload. */ }
      } catch (error) { if (!(error instanceof TransactionNotFoundError)) throw error; }
    }
    if (identity) {
      const original = identity;
      const replacement = await locateReplacement(original, latest,
        (blockNumber) => client.getTransactionCount({ address: original.from, blockNumber }),
        async (blockNumber) => (await client.getBlock({ blockNumber, includeTransactions: true })).transactions);
      if (replacement && replacement !== hash && !signal.aborted) { replaced(replacement, true); return; }
    }
    if (!signal.aborted) await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, 4000);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}

export function createBrowserPaymentAdapter(config: Config, setup: PaymentSetup, invoiceUrl: string): PaymentAdapter {
  const client = createPublicClient({ chain: arcTestnet, transport: http(setup.rpcUrl, { retryCount: 0, timeout: 15_000 }) });
  const args = (payment: AuthorizedPayment) => [payment.message.invoiceKey, payment.message.documentCommitment,
    payment.message.payee, payment.message.amount, payment.message.authorizationValidUntil, payment.message.payableUntil, payment.signature] as const;
  return {
    async account() {
      const wallet = await getWalletClient(config);
      const [addresses, chainId] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
      if (!addresses[0]) throw new PaymentError("WALLET_CHANGED");
      return { address: addresses[0], chainId };
    },
    balance: (address) => client.getBalance({ address }),
    async authorize() {
      const url = new URL(invoiceUrl);
      const response = await fetch(`/api${url.pathname}/authorize`, { method: "POST", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new PaymentError("AUTHORIZATION_INVALID");
      return response.json();
    },
    async simulate(payment, account) {
      if (await client.getChainId() !== 5042002) throw new PaymentError("WRONG_NETWORK");
      const call = { address: setup.contractAddress, abi: payrSettlementAbi, functionName: "payInvoice" as const,
        args: args(payment), account, value: payment.message.amount };
      await client.simulateContract(call);
      const [estimate, fees] = await Promise.all([client.estimateContractGas(call), client.estimateFeesPerGas()]);
      return { gas: (estimate * 120n + 99n) / 100n, maxFeePerGas: fees.maxFeePerGas };
    },
    async write(payment, account, gas, maxFeePerGas) {
      const wallet = await getWalletClient(config);
      const [addresses, chainId] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
      if (addresses[0]?.toLowerCase() !== account.toLowerCase() || chainId !== 5042002) throw new PaymentError("WALLET_CHANGED");
      if (Date.now() >= Number(payment.message.authorizationValidUntil) * 1000) throw new PaymentError("AUTHORIZATION_EXPIRED");
      return wallet.writeContract({ chain: arcTestnet, account, address: setup.contractAddress, abi: payrSettlementAbi,
        functionName: "payInvoice", args: args(payment), value: payment.message.amount, gas, maxFeePerGas, maxPriorityFeePerGas: 0n });
    },
  };
}

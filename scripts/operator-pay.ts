import { createInterface } from "node:readline/promises";
import { isDeepStrictEqual } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, formatUnits, http, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { parsePublicEnv } from "../src/config/env";
import { payrSettlementAbi } from "../src/lib/chain/abi";
import { arcTestnet } from "../src/lib/chain/arc";
import { paymentTypedData, paymentTypes } from "../src/lib/domain/payment-authorization";
import { submitOperatorPayment, verifyOperatorPayment } from "../src/lib/chain/operator-payment";
import { publicRpcHost } from "../src/lib/chain/deployment";

async function main() {
  const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`);
  const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((v) => v as `0x${string}`);
  const journalPath = resolve(".operator-payment.json");
  if (process.argv.length === 3 && process.argv[2] === "--recover") {
    const rpcUrl = z.string().url().parse(process.env.ARC_RPC_URL);
    publicRpcHost(rpcUrl);
    const chain = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl, { retryCount: 0, timeout: 15_000 }) });
    const evidence = await verifyOperatorPayment(chain, journalPath, address.parse(process.env.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS));
    console.log(`Verified: https://testnet.arcscan.app/tx/${evidence.transactionHash}`);
    console.log(`Block ${evidence.blockNumber}, log ${evidence.logIndex}. Authorization ID: ${evidence.authorizationId}.`);
    console.log("Read-only recovery. Separately read back the authorization row; this is not a database settlement or receipt.");
    return;
  }
  if (process.argv.length !== 2 || process.env.RUN_LIVE_ARC_PAYMENT !== "1" || !process.stdin.isTTY) throw new Error("Operator approval required");
  if (existsSync(journalPath)) throw new Error("Existing payment journal requires read-only recovery");
  const config = z.object({
    ARC_RPC_URL: z.string().url(), PAYR_OPERATOR_INVOICE_URL: z.string().url(),
    OPERATOR_PAYER_PRIVATE_KEY: hash, NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: address, PAYR_ATTESTOR_ADDRESS: address,
  }).parse(process.env);
  publicRpcHost(config.ARC_RPC_URL);
  const origin = parsePublicEnv(process.env).NEXT_PUBLIC_APP_URL;
  const invoiceUrl = new URL(config.PAYR_OPERATOR_INVOICE_URL);
  if (invoiceUrl.origin !== origin || invoiceUrl.protocol !== "https:" || invoiceUrl.username || invoiceUrl.password
    || invoiceUrl.search || invoiceUrl.hash || !/^\/invoice\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(invoiceUrl.pathname)) throw new Error("Invalid protected invoice origin");
  const response = await fetch(new URL(`/api${invoiceUrl.pathname}/authorize`, origin), { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Authorization unavailable");
  const integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
  const authorization = z.object({
    schemaVersion: z.literal("payr.payment-authorization.v1"), authorizationId: z.string().uuid(),
    domain: z.object({ name: z.literal("Payr"), version: z.literal("1"), chainId: z.literal(5042002), verifyingContract: address }).strict(),
    primaryType: z.literal("PayrPayment"), types: z.unknown(),
    message: z.object({ invoiceKey: hash, documentCommitment: hash, payee: address, amount: integer,
      authorizationValidUntil: integer, payableUntil: integer }).strict(),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((v) => v as `0x${string}`),
    signerMode: z.literal("local-testnet"), network: z.literal("Arc Testnet"),
  }).strict().parse(await response.json());
  if (!isDeepStrictEqual(authorization.types, paymentTypes)
    || authorization.domain.verifyingContract.toLowerCase() !== config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS.toLowerCase()) throw new Error("Authorization binding mismatch");
  const message = { ...authorization.message, amount: BigInt(authorization.message.amount),
    authorizationValidUntil: BigInt(authorization.message.authorizationValidUntil), payableUntil: BigInt(authorization.message.payableUntil) };
  const account = privateKeyToAccount(config.OPERATOR_PAYER_PRIVATE_KEY);
  const transport = http(config.ARC_RPC_URL, { retryCount: 0, timeout: 15_000 });
  const chain = createPublicClient({ chain: arcTestnet, transport });
  if (await chain.getChainId() !== arcTestnet.id) throw new Error("Wrong chain");
  const attestor = await chain.readContract({ address: config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS, abi: payrSettlementAbi, functionName: "attestor" });
  const recovered = await recoverTypedDataAddress({ ...paymentTypedData(arcTestnet.id, config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS, message), signature: authorization.signature });
  if (attestor.toLowerCase() !== config.PAYR_ATTESTOR_ADDRESS.toLowerCase() || recovered.toLowerCase() !== attestor.toLowerCase()
    || account.address.toLowerCase() === attestor.toLowerCase() || account.address.toLowerCase() === message.payee.toLowerCase()) throw new Error("Use a separate funded operator payer");
  const confirmation = `PAY 5042002 ${message.payee.toLowerCase()} ${formatUnits(message.amount, 18)} USDC`;
  console.log(`Arc TESTNET ONLY. Contract: ${config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS}. Payer: ${account.address}.`);
  console.log("Maximum gas cost: 0.1 testnet USDC. The payment journal is retained before broadcast.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (await terminal.question(`Confirm payee and amount by typing:\n${confirmation}\n> `) !== confirmation) throw new Error("Payment not approved");
  } finally { terminal.close(); }
  const wallet = createWalletClient({ account, chain: arcTestnet, transport });
  const { transactionHash } = await submitOperatorPayment(chain, wallet, { journalPath,
    payment: { authorizationId: authorization.authorizationId, contractAddress: config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS,
      message, signature: authorization.signature } });
  console.log(`Submitted: https://testnet.arcscan.app/tx/${transactionHash}`);
  await chain.waitForTransactionReceipt({ hash: transactionHash, timeout: 120_000 });
  const evidence = await verifyOperatorPayment(chain, journalPath, config.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS);
  console.log(`Verified exact transfer and InvoicePaid at block ${evidence.blockNumber}, log ${evidence.logIndex}. Authorization ID: ${evidence.authorizationId}.`);
  console.log("This is chain evidence, not a database settlement or receipt. R08 reconciliation records those independently.");
}

main().catch(() => { console.error("Operator payment stopped or verification failed. If .operator-payment.json exists, retain it and run this script with --recover (read-only, no payer key needed). Never delete an unresolved journal or retry blindly. No credentials or signatures are logged."); process.exitCode = 1; });

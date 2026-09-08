import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { seedBrowserWorkspace } from "./workspace-fixture";
import { testPublicationSnapshot } from "../../src/lib/invoices/publication.test-support";
import { createDraftRepository } from "../../src/lib/db/drafts";
import { createPublicationRepository } from "../../src/lib/db/publication";
import { createIdentityRepository } from "../../src/lib/db/identity";
import { createInvoiceDraftService } from "../../src/lib/invoices/service";
import { createKeyedTokenCodec } from "../../src/lib/security/keyed-token";
import { createPublicationLinkEnv } from "../../src/config/env";
import { canonicalPublicationJson, publicationLink } from "../../src/lib/invoices/publication-links";
import { paymentTypedData } from "../../src/lib/domain/payment-authorization";
import type { PublicInvoiceStatusResult } from "../../src/lib/domain/status";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.setTimeout(120_000);

async function fixture() {
  if (process.env.SUPABASE_URL !== "http://127.0.0.1:57321") throw new Error("Local payment fixtures only");
  const owner = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  seedBrowserWorkspace(owner);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = createIdentityRepository(db), publication = createPublicationRepository(db);
  const snapshot = testPublicationSnapshot();
  await identity.saveProfile(owner, { expectedRevision: 1, businessName: "Payment test developer", billingAddress: snapshot.sender.billingAddress!,
    contactName: "Test Owner", contactEmail: "owner@example.test", invoicePrefix: "PAY", defaultPaymentTermsDays: 7 });
  const client = await identity.saveClient(owner, { id: null, expectedRevision: null, alias: "test-client", ...snapshot.client });
  const actor = { ...owner, connectorId: null };
  const draft = await createInvoiceDraftService(createDraftRepository(db)).createDraft(actor, { client: { id: client.id },
    items: [{ description: "Payment UI fixture", amount: "1" }], useDefaultTerms: true, idempotencyKey: randomUUID() });
  const hash = () => `0x${randomBytes(32).toString("hex")}` as const;
  const config = createPublicationLinkEnv();
  const tokenId = randomUUID(), token = createKeyedTokenCodec(config.keys).derive(tokenId, "invoice-bearer", 1);
  const reserved = await publication.reserve(actor, { draftId: draft.draftId, expectedVersion: draft.version, approval: true, idempotencyKey: randomUUID(),
    requestFingerprint: randomBytes(32).toString("hex"), attemptId: randomUUID(), invoiceKey: hash(), publicationSalt: hash(), tokenId,
    keyVersion: 1, verifierHash: token.verifierHash, chainId: 5042002, contractAddress: `0x${"3".repeat(40)}` });
  const claimed = (await publication.claim(reserved.id, randomUUID()))!;
  const fence = { attemptId: claimed.id, leaseOwner: claimed.leaseOwner!, fence: claimed.fence };
  // Synthetic artifact metadata isolates wallet UI; invoice-page.spec.ts covers real PDF publication.
  await publication.store({ ...fence, artifact: { pdfFilename: `${reserved.invoiceNumber}.pdf`, contentType: "application/pdf", byteLength: 100,
    invoiceDataHash: keccak256(toHex(canonicalPublicationJson(reserved))), pdfContentHash: hash(), documentCommitment: hash(), qrVerified: true } });
  const attempt = (await publication.finalize(fence))!;
  return { attempt, invoiceUrl: publicationLink(attempt.link, "invoice-bearer", config) };
}

for (const rejected of [false, true]) {
  test(`payment: ${rejected ? "invalid authorization never requests a wallet write" : "exact native USDC payment waits for server settlement and receipt"}`, async ({ page, baseURL }) => {
    const { attempt, invoiceUrl } = await fixture();
    let authorizationCalls = 0, settled = false, receiptReady = false;
    const transactionHash = `0x${"6".repeat(64)}` as const;
    const receiptUrl = `${baseURL}/receipt/synthetic-payment-receipt`;
    await page.addInitScript(() => {
      const calls: Array<{ method: string; params?: unknown[] }> = [];
      Object.assign(window, { paymentWalletCalls: calls, ethereum: {
        isMetaMask: true, on() {}, removeListener() {}, async request(input: { method: string; params?: unknown[] }) {
          calls.push(input);
          if (["eth_requestAccounts", "eth_accounts"].includes(input.method)) return [`0x${"5".repeat(40)}`];
          if (input.method === "eth_chainId") return "0x4cef52";
          if (input.method === "eth_sendTransaction") return `0x${"6".repeat(64)}`;
          if (input.method === "wallet_getCapabilities") return {};
          throw new Error("Test wallet method unavailable");
        },
      } });
    });
    await page.route("https://rpc.testnet.arc.network/**", async (route) => {
      const result = (method: string) => {
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "eth_blockNumber") return "0x64";
        if (method === "eth_getBalance") return "0x1bc16d674ec80000";
        if (method === "eth_call") return "0x";
        if (["eth_getTransactionReceipt", "eth_getTransactionByHash"].includes(method)) return null;
        if (method === "eth_estimateGas") return "0x186a0";
        if (method === "eth_getBlockByNumber") return { number: "0x64", hash: `0x${"1".repeat(64)}`, parentHash: `0x${"2".repeat(64)}`,
          timestamp: "0x70000000", baseFeePerGas: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [], uncles: [],
          difficulty: "0x0", extraData: "0x", miner: `0x${"0".repeat(40)}`, size: "0x1" };
        if (["eth_maxPriorityFeePerGas", "eth_gasPrice"].includes(method)) return "0x1";
        throw new Error(`Unexpected mocked RPC method: ${method}`);
      };
      const respond = (r: { id: number; method: string }) => ({ jsonrpc: "2.0", id: r.id, result: result(r.method) });
      const request = route.request().postDataJSON();
      await route.fulfill({ json: Array.isArray(request) ? request.map(respond) : respond(request) });
    });
    await page.route("**/api/invoice/*/authorize", async (route) => {
      authorizationCalls++;
      expect(route.request().method() === "POST" && !route.request().postData()).toBe(true);
      if (rejected) {
        await route.fulfill({ status: 503, json: { code: "AUTHORIZATION_UNAVAILABLE" } });
        return;
      }
      const typed = paymentTypedData(5042002, attempt.contractAddress, { invoiceKey: attempt.invoiceKey,
        documentCommitment: attempt.artifact!.documentCommitment, payee: attempt.snapshot.sender.payoutWallet as `0x${string}`,
        amount: 10n ** 18n, authorizationValidUntil: BigInt(Math.floor(Date.now() / 1000) + 300),
        payableUntil: BigInt(Date.parse(attempt.snapshot.payableUntil) / 1000) });
      await route.fulfill({ json: { ...typed, domain: { ...typed.domain, chainId: 5042002 }, schemaVersion: "payr.payment-authorization.v1",
        authorizationId: randomUUID(), message: { ...typed.message, amount: "1000000000000000000",
          authorizationValidUntil: typed.message.authorizationValidUntil.toString(), payableUntil: typed.message.payableUntil.toString() },
        signature: await privateKeyToAccount(`0x${"0".repeat(63)}1`).signTypedData(typed), signerMode: "local-testnet", network: "Arc Testnet" } });
    });
    await page.route("**/api/reconcile/transaction", (route) => route.fulfill({ json: { outcome: "pending" } }));
    await page.route("**/invoice/*/status", (route) => {
      const status: PublicInvoiceStatusResult = {
        schemaVersion: "payr.public-invoice-status.v1", invoiceVersion: attempt.invoiceVersion, invoiceNumber: attempt.invoiceNumber,
        payableUntil: attempt.snapshot.payableUntil, commercialState: "published", paymentStatus: settled ? "paid" : "unpaid",
        displayStatus: settled ? "Paid" : "Published", settledAfterVoid: false, settlement: settled ? {
          chainId: 5042002, contractAddress: attempt.contractAddress, documentCommitment: attempt.artifact!.documentCommitment,
          transactionHash, payee: attempt.snapshot.sender.payoutWallet as `0x${string}`, amountAtomic: "1000000000000000000",
          invoiceVersion: attempt.invoiceVersion, logIndex: 0, blockNumber: "100", blockTime: new Date().toISOString(),
          payer: `0x${"5".repeat(40)}`, amountDecimal: "1",
        } : null,
        explorer: settled ? { transactionUrl: `https://testnet.arcscan.app/tx/${transactionHash}` } : null,
        receipt: receiptReady ? { state: "ready", pageUrl: receiptUrl, pdfUrl: `${receiptUrl}/pdf`,
          pdfFilename: "payment-receipt.pdf", pdfContentHash: `0x${"7".repeat(64)}` }
          : { state: settled ? "pending" : "not_applicable", pageUrl: null, pdfUrl: null, pdfFilename: null, pdfContentHash: null },
        receiptEmailState: receiptReady ? "sent" : settled ? "queued" : "not_applicable",
      };
      return route.fulfill({ json: status });
    });
    // Keep bearer-bearing navigation failures and document snapshots out of retained artifacts.
    await page.goto(baseURL!);
    let passed = false;
    let stage = "connect";
    try {
      await page.evaluate((url) => { window.location.assign(url); }, invoiceUrl);
      await page.getByRole("button", { name: "Connect browser wallet" }).click();
      const pay = page.getByRole("button", { name: "Pay Invoice (1 USDC)" });
      await expect(pay).toBeEnabled();
      expect(authorizationCalls).toBe(0);
      stage = "authorization result";
      await pay.click();
      if (rejected) {
        await expect(page.getByRole("alert").filter({ hasText: "Payment authorization was unavailable or invalid." }))
          .toHaveText("Payment authorization was unavailable or invalid. Refresh the invoice before trying again.");
        await expect(pay).toBeEnabled();
      } else {
        await expect(page.getByText("Transaction submitted. Verifying payment...")).toBeVisible();
      }
      expect(authorizationCalls).toBe(1);
      stage = "wallet write count and value";
      const sent = await page.evaluate(() => (window as unknown as { paymentWalletCalls: Array<{ method: string; params?: Array<{ value: string; to: string }> }> }).paymentWalletCalls
        .filter((call) => call.method === "eth_sendTransaction").map((call) => ({ value: call.params![0].value, to: call.params![0].to })));
      expect(sent).toEqual(rejected ? [] : [{ value: "0xde0b6b3a7640000", to: attempt.contractAddress }]);
      stage = "persisted status progression";
      await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
      if (!rejected) {
        settled = true;
        await page.getByRole("button", { name: "Check payment status" }).click();
        await expect(page.getByRole("heading", { name: "Payment verified" })).toBeVisible();
        await expect(page.getByText("Receipt queued.", { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "View receipt", exact: true })).toHaveCount(0);
        receiptReady = true;
        await page.getByRole("button", { name: "Check payment status" }).click();
        await expect(page.getByText("Paid", { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "View receipt", exact: true })).toHaveAttribute("href", receiptUrl);
        await expect(page.getByText("Email status: Accepted by email provider, not confirmation of inbox delivery")).toBeVisible();
      }
      stage = "responsive overflow";
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      passed = true;
    } catch { /* Only the boolean result survives after closing the protected page. */ }
    finally { await page.close(); }
    expect(passed, `${rejected ? "Authorization failure must not submit payment" : "Payment and receipt progression must pass"}: ${stage}`).toBe(true);
  });
}

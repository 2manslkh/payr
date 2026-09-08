import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from "viem";
import { createSupabaseAdminClient } from "./admin";
import { createReconciliationRepository } from "./reconciliation";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { createReconciler } from "../payments/reconcile";
import { payrSettlementAbi } from "../chain/abi";
import { createInvoiceLifecycleService } from "../invoices/lifecycle";
import { publishedFixture, sql } from "./settlement.test-support";

it("looks up the exact frozen target after void and preserves idempotent settlement follow-ups", async () => {
  const { db, actor, target, draft, publication, hash } = await publishedFixture();
  await publication.voidInvoice(actor, { invoiceId: draft.draftId, expectedVersion: 1, approval: true, idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
  const repository = createReconciliationRepository(db);
  const found = await repository.findTarget(5042002, target.contractAddress, target.invoiceKey);
  expect(found?.invoiceVersionId).toBe(target.invoiceVersionId);
  expect(found?.link.revokedAt).not.toBeNull();
  expect(await repository.findTarget(1, target.contractAddress, target.invoiceKey)).toBeNull();
  const tokenId = randomUUID();
  const receipt = createKeyedTokenCodec(new Map([[1, randomBytes(32)]])).derive(tokenId, "receipt-bearer", 1);
  const write = { workspaceId: actor.workspaceId, chainId: 5042002, contractAddress: target.contractAddress, invoiceKey: target.invoiceKey,
    transactionHash: hash(), logIndex: 0, blockNumber: "100", blockTime: new Date().toISOString(),
    documentCommitment: target.artifact!.documentCommitment, payer: `0x${"5".repeat(40)}` as const, payee: target.snapshot.sender.payoutWallet as `0x${string}`,
    amountAtomic: target.snapshot.amountAtomic, receiptTokenId: tokenId, receiptKeyVersion: 1, receiptVerifierHash: receipt.verifierHash,
    receiptExpiresAt: "2035-01-01T00:00:00Z", deliveries: [
      { messageKind: "receipt" as const, normalizedRecipient: "client@example.test", roles: ["client" as const] },
      { messageKind: "receipt" as const, normalizedRecipient: "owner@example.test", roles: ["issuer" as const] },
    ] };
  const first = await repository.recordSettlement(write);
  const replay = await repository.recordSettlement(write);
  expect(replay).toEqual({ ...first, outcome: "replayed" });
  expect(sql(`select count(*) from public.receipt_documents where settlement_id='${first.settlementId}';`)).toBe("1");
  expect(sql(`select count(*) from public.email_deliveries where settlement_id='${first.settlementId}';`)).toBe("2");
});

it.each(["before void", "after void", "equal to void", "after expiry", "concurrent replay", "same recipient"])(
  "reconciles actual repository state for %s without duplicating receipt or delivery work", async (scenario) => {
    const { db, actor, target, publication, hash, keys } = await publishedFixture(scenario === "same recipient");
    const repository = createReconciliationRepository(db);
    const voidSecond = BigInt(Math.ceil(Date.now() / 1000) + 2);
    let eventSecond = voidSecond;
    if (scenario.includes("void")) {
      await publication.voidInvoice(actor, { invoiceId: target.invoiceId, expectedVersion: 1, approval: true,
        idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
      sql(`begin; set local session_replication_role = replica;
        update public.invoices set voided_at=to_timestamp(${voidSecond}) where workspace_id='${actor.workspaceId}' and id='${target.invoiceId}'; commit;`);
      eventSecond += scenario === "before void" ? -1n : scenario === "after void" ? 1n : 0n;
    }
    const payableUntil = Date.parse(target.snapshot.payableUntil);
    if (scenario === "after expiry") {
      // Project the scheduler having already expired this isolated fixture; the event still precedes its frozen deadline.
      sql(`begin; set local session_replication_role = replica; update public.invoices
        set commercial_state='expired',expired_at=payable_until where workspace_id='${actor.workspaceId}' and id='${target.invoiceId}'; commit;`);
      eventSecond = BigInt(payableUntil / 1000) - 1n;
    }
    const transactionHash = hash(), blockHash = hash();
    const receipt = { status: "success", transactionHash, blockHash, blockNumber: 100n, logs: [{
      address: target.contractAddress, transactionHash, blockHash, blockNumber: 100n, logIndex: 3, removed: false,
      topics: encodeEventTopics({ abi: payrSettlementAbi, eventName: "InvoicePaid", args: { invoiceKey: target.invoiceKey,
        payer: `0x${"5".repeat(40)}`, payee: target.snapshot.sender.payoutWallet as `0x${string}` } }),
      data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [target.artifact!.documentCommitment, BigInt(target.snapshot.amountAtomic)]),
    }] } as unknown as TransactionReceipt;
    const chain = { chainId: async () => 5042002, receipt: async () => receipt,
      block: async () => ({ hash: blockHash, number: 100n, timestamp: eventSecond }), latest: async () => 100n,
      transactions: async () => receipt.logs };
    const config = { chainId: 5042002, contractAddress: target.contractAddress, contracts: [target.contractAddress],
      startBlock: 100n, rpcUrl: "https://rpc.test", appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", activeKeyVersion: 1, keys };
    const service = createReconciler(chain, repository, config);
    if (scenario === "concurrent replay") {
      await Promise.all([service.transaction(transactionHash), service.backfill(1), service.transaction(transactionHash)]);
    } else expect(await service.transaction(transactionHash)).toEqual({ outcome: "verified" });
    const query = `from public.settlements where workspace_id='${actor.workspaceId}' and invoice_id='${target.invoiceId}'`;
    const settlementId = sql(`select id ${query};`);
    const receiptIdentity = sql(`select id::text||':'||token_id::text||':'||verifier_hash from public.receipt_documents where settlement_id='${settlementId}';`);
    await createReconciler(chain, createReconciliationRepository(db), config).transaction(transactionHash);
    expect(sql(`select count(*) ${query};`)).toBe("1");
    expect(sql(`select count(*) from public.receipt_documents where settlement_id='${settlementId}';`)).toBe("1");
    expect(sql(`select id::text||':'||token_id::text||':'||verifier_hash from public.receipt_documents where settlement_id='${settlementId}';`)).toBe(receiptIdentity);
    const lifecycle = createInvoiceLifecycleService(publication, () => config,
      () => new Date(scenario === "after expiry" ? payableUntil + 1000 : Date.now()));
    const status = await lifecycle.status(actor, target.invoiceId);
    expect(status).toMatchObject({ commercialState: scenario.includes("void") ? "voided" : scenario === "after expiry" ? "expired" : "published",
      displayStatus: "Paid", paymentStatus: "paid", settledAfterVoid: scenario === "after void",
      settlement: { transactionHash, logIndex: 3 },
      receipt: { state: "pending", pageUrl: null, pdfUrl: null }, receiptEmail: { state: "queued" } });
    expect(Date.parse(status.settlement!.blockTime)).toBe(Number(eventSecond) * 1000);
    expect(status.receiptEmail.deliveries).toHaveLength(scenario === "same recipient" ? 1 : 2);
    if (scenario === "same recipient") expect(status.receiptEmail.deliveries[0].roles).toEqual(["issuer", "client"]);
  },
);

it("uses decimal-string cursors and compare-and-set advancement", async () => {
  const repository = createReconciliationRepository(createSupabaseAdminClient());
  const contract = `0x${randomBytes(20).toString("hex")}` as const;
  const start = 9007199254740993n;
  expect(await repository.cursor(5042002, contract, start)).toEqual({ block: start, logIndex: 0 });
  expect(await repository.advance(5042002, contract, { block: start, logIndex: 0 }, { block: start, logIndex: 1 })).toBe(true);
  expect(await repository.advance(5042002, contract, { block: start, logIndex: 0 }, { block: start, logIndex: 2 })).toBe(false);
  expect(await repository.cursor(5042002, contract, 0n)).toEqual({ block: start, logIndex: 1 });
  await expect(repository.advance(5042002, contract, { block: start, logIndex: 1 }, { block: start + 30000n, logIndex: 0 })).rejects.toThrow();
});

it("denies anonymous/authenticated execution of every new RPC", () => {
  for (const fn of ["payr_reconciliation_target_v1(bigint,text,text)", "payr_reconciliation_position_v1(bigint,text,numeric)", "payr_advance_reconciliation_position_v1(bigint,text,numeric,integer,numeric,integer)"]) {
    for (const role of ["anon", "authenticated"]) expect(sql(`select has_function_privilege('${role}','public.${fn}','execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role','public.${fn}','execute');`)).toBe("t");
  }
});

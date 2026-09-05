import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSupabaseAdminClient } from "./admin";
import {
  createPayrRepositories,
  type AllocateInvoiceSequenceInput,
  type PayrRepositories,
  type RecordPaymentAuthorizationInput,
  type RecordSettlementInput,
} from "./repositories";

const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const INVOICE_A = "10000000-0000-4000-8000-000000000201";
const VERSION_A = "10000000-0000-4000-8000-000000000301";
const VERSION_B = "10000000-0000-4000-8000-000000000302";
const CONTRACT = `0x${"1".repeat(40)}` as const;
const PAYEE = `0x${"2".repeat(40)}` as const;
const INVOICE_KEY = `0x${"a".repeat(64)}` as const;
const COMMITMENT = `0x${"c".repeat(64)}` as const;
const AMOUNT = "1000000000000000001";

function resetFixtures(): void {
  const api = new URL(process.env.SUPABASE_URL!);
  const database = new URL(process.env.SUPABASE_DB_URL!);
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "57321"
    || database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1"
    || database.port !== "57322" || database.username !== "postgres" || database.pathname !== "/postgres") {
    throw new Error("Repository fixtures require the local Payr Supabase runtime on 5732x ports");
  }

  // Only fixture setup uses postgres. Every mutation under test goes through the service-role adapter.
  execFileSync("docker", [
    "exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1",
  ], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: `
      begin;
      truncate table public.workspaces cascade;
      ${[1, 2].map((suffix) => {
        const workspaceId = suffix === 1 ? WORKSPACE_A : WORKSPACE_B;
        const clientId = `10000000-0000-4000-8000-00000000010${suffix}`;
        const invoiceId = `10000000-0000-4000-8000-00000000020${suffix}`;
        const versionId = `10000000-0000-4000-8000-00000000030${suffix}`;
        return `
          insert into public.workspaces (id, owner_wallet)
          values ('${workspaceId}', '0x${String(suffix + 2).repeat(40)}');
          insert into public.clients (id, workspace_id, alias, business_name, billing_address, contact_email)
          values ('${clientId}', '${workspaceId}', 'client-${suffix}', 'Client ${suffix}', '{}', 'client${suffix}@example.test');
          insert into public.invoices (
            id, workspace_id, client_id, commercial_state, invoice_number, published_at, payable_until
          ) values (
            '${invoiceId}', '${workspaceId}', '${clientId}', 'published', 'PAYR-2026-${suffix}',
            now() - interval '1 day', date_trunc('second', now() + interval '30 days')
          );
          insert into public.invoice_versions (
            id, workspace_id, invoice_id, version_number, sender_snapshot, client_snapshot, line_items,
            issue_date, due_date, payable_until, payable_until_second, amount_decimal, amount_atomic,
            chain_id, contract_address, payee, frozen_at
          ) values (
            '${versionId}', '${workspaceId}', '${invoiceId}', 1, '{}', '{}', '[]', current_date, current_date + 7,
            date_trunc('second', now() + interval '30 days'),
            extract(epoch from date_trunc('second', now() + interval '30 days'))::bigint,
            '1.000000000000000001', ${AMOUNT}, 5042002, '${CONTRACT}', '${PAYEE}', now()
          );
          insert into public.publication_attempts (
            id, workspace_id, invoice_id, invoice_version_id, state, request_fingerprint,
            sequence_year, sequence_value, invoice_number, invoice_key, publication_salt, storage_key,
            invoice_token_id, invoice_key_version, invoice_verifier_hash, invoice_link_expires_at,
            invoice_data_hash, pdf_content_hash, document_commitment, pdf_filename, pdf_byte_length,
            pdf_content_type, stored_at, finalized_at
          ) values (
            '10000000-0000-4000-8000-00000000040${suffix}', '${workspaceId}', '${invoiceId}', '${versionId}',
            'finalized', '${String(suffix).repeat(64)}', 2026, ${suffix}, 'PAYR-2026-${suffix}',
            '${suffix === 1 ? INVOICE_KEY : `0x${"b".repeat(64)}`}', '0x${"5".repeat(64)}', 'repository/${suffix}/invoice.pdf',
            '10000000-0000-4000-8000-00000000050${suffix}', 1, '${"6".repeat(64)}', now() + interval '60 days',
            '0x${"7".repeat(64)}', '0x${"8".repeat(64)}', '${COMMITMENT}', 'PAYR-2026-${suffix}.pdf', 100,
            'application/pdf', now(), now()
          );
        `;
      }).join("\n")}
      commit;
    `,
  });
}

const allocationInput: AllocateInvoiceSequenceInput = {
  workspaceId: WORKSPACE_A,
  sequenceYear: 2026,
  idempotencyKey: "repository-publication",
  requestFingerprint: "a".repeat(64),
};

function authorizationInput(): RecordPaymentAuthorizationInput {
  const issuedAtSecond = Math.floor(Date.now() / 1_000) - 1;
  return {
    workspaceId: WORKSPACE_A,
    authorizationId: randomUUID(),
    invoiceId: INVOICE_A,
    invoiceVersionId: VERSION_A,
    invoiceKey: INVOICE_KEY,
    chainId: 5_042_002,
    contractAddress: CONTRACT,
    documentCommitment: COMMITMENT,
    payee: PAYEE,
    amountAtomic: AMOUNT,
    attestor: `0x${"3".repeat(40)}`,
    typedDataDigest: `0x${"4".repeat(64)}`,
    signatureHash: `0x${"5".repeat(64)}`,
    signerMode: "local-testnet",
    policyResult: "allowed",
    issuedAtSecond,
    authorizationValidUntil: issuedAtSecond + 600,
  };
}

function settlementInput(): RecordSettlementInput {
  return {
    workspaceId: WORKSPACE_A,
    chainId: 5_042_002,
    contractAddress: CONTRACT,
    invoiceKey: INVOICE_KEY,
    transactionHash: `0x${"d".repeat(64)}`,
    logIndex: 0,
    blockNumber: "9007199254740993",
    blockTime: "2026-09-05T00:00:00.123Z",
    documentCommitment: COMMITMENT,
    payer: `0x${"e".repeat(40)}`,
    payee: PAYEE,
    amountAtomic: AMOUNT,
    receiptTokenId: randomUUID(),
    receiptKeyVersion: 1,
    receiptVerifierHash: "f".repeat(64),
    receiptExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    deliveries: [
      { messageKind: "receipt", normalizedRecipient: "client@example.test", roles: ["client"] },
      { messageKind: "receipt", normalizedRecipient: "shared@example.test", roles: ["issuer", "client"] },
    ],
  };
}

describe("Payr repository transactions through Supabase", () => {
  let serviceRole: ReturnType<typeof createSupabaseAdminClient>;
  let repositories: PayrRepositories;

  beforeAll(() => {
    serviceRole = createSupabaseAdminClient();
    repositories = createPayrRepositories(serviceRole);
  });

  beforeEach(resetFixtures);

  it("allocates, replays and rejects idempotency conflicts without consuming another number", async () => {
    await expect(repositories.allocateInvoiceSequence(allocationInput))
      .resolves.toEqual({ outcome: "allocated", sequenceValue: 1n });
    await expect(repositories.allocateInvoiceSequence(allocationInput))
      .resolves.toEqual({ outcome: "replayed", sequenceValue: 1n });
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, requestFingerprint: "b".repeat(64) }))
      .rejects.toThrow(/^IDEMPOTENCY_CONFLICT$/);
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, idempotencyKey: "next" }))
      .resolves.toEqual({ outcome: "allocated", sequenceValue: 2n });

    const { data, error } = await serviceRole.from("idempotency_requests")
      .select("request_fingerprint,result_descriptor").eq("workspace_id", WORKSPACE_A)
      .eq("idempotency_key", allocationInput.idempotencyKey).single();
    expect(error).toBeNull();
    expect(data).toEqual({ request_fingerprint: allocationInput.requestFingerprint, result_descriptor: { state: "1" } });
  });

  it("isolates sequence and idempotency scope by workspace and sequence scope by year", async () => {
    await repositories.allocateInvoiceSequence(allocationInput);
    await expect(repositories.allocateInvoiceSequence({
      ...allocationInput, workspaceId: WORKSPACE_B, requestFingerprint: "b".repeat(64),
    })).resolves.toEqual({ outcome: "allocated", sequenceValue: 1n });
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, idempotencyKey: "next-year", sequenceYear: 2027 }))
      .resolves.toEqual({ outcome: "allocated", sequenceValue: 1n });
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, idempotencyKey: "next" }))
      .resolves.toEqual({ outcome: "allocated", sequenceValue: 2n });
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, workspaceId: randomUUID() }))
      .rejects.toThrow("failed (23503)");
  });

  it("allocates concurrent requests uniquely and replays concurrent duplicate keys", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      repositories.allocateInvoiceSequence({ ...allocationInput, idempotencyKey: `concurrent-${index}` })));
    expect(results.every((result) => result.outcome === "allocated")).toBe(true);
    expect(results.map((result) => result.sequenceValue).sort((a, b) => a < b ? -1 : a > b ? 1 : 0))
      .toEqual(Array.from({ length: 10 }, (_, index) => BigInt(index + 1)));

    const duplicates = await Promise.all(Array.from({ length: 5 }, () => repositories.allocateInvoiceSequence(allocationInput)));
    expect(duplicates.filter((result) => result.outcome === "allocated")).toHaveLength(1);
    expect(duplicates.filter((result) => result.outcome === "replayed")).toHaveLength(4);
    expect(duplicates.every((result) => result.sequenceValue === 11n)).toBe(true);
  });

  it("persists the exact authorization before returning its ID and denies duplicate IDs", async () => {
    const input = authorizationInput();
    await expect(repositories.recordPaymentAuthorization(input)).resolves.toBe(input.authorizationId);
    const { data, error } = await serviceRole.from("payment_authorizations")
      .select("id,invoice_id,invoice_version_id,invoice_key,amount_atomic::text,typed_data_digest,signature_hash,issued_at_second,authorization_valid_until")
      .eq("workspace_id", WORKSPACE_A).eq("id", input.authorizationId).single();
    expect(error).toBeNull();
    expect(data).toEqual({
      id: input.authorizationId, invoice_id: INVOICE_A, invoice_version_id: VERSION_A, invoice_key: INVOICE_KEY,
      amount_atomic: AMOUNT, typed_data_digest: input.typedDataDigest, signature_hash: input.signatureHash,
      issued_at_second: input.issuedAtSecond, authorization_valid_until: input.authorizationValidUntil,
    });
    await expect(repositories.recordPaymentAuthorization(input)).rejects.toThrow("failed (23505)");
  });

  it("denies cross-workspace authorization targets, changed facts and invalid deadlines without inserting", async () => {
    const input = authorizationInput();
    const { data: version, error } = await serviceRole.from("invoice_versions").select("payable_until_second")
      .eq("workspace_id", WORKSPACE_A).eq("id", VERSION_A).single();
    expect(error).toBeNull();
    for (const change of [{ workspaceId: WORKSPACE_B }, { invoiceVersionId: VERSION_B }]) {
      await expect(repositories.recordPaymentAuthorization({ ...input, ...change }))
        .rejects.toThrow("AUTHORIZATION_NOT_PAYABLE");
    }
    await expect(repositories.recordPaymentAuthorization({ ...input, amountAtomic: "2" }))
      .rejects.toThrow("AUTHORIZATION_FACTS_MISMATCH");
    for (const authorizationValidUntil of [input.issuedAtSecond, Number(version!.payable_until_second)]) {
      await expect(repositories.recordPaymentAuthorization({ ...input, authorizationValidUntil }))
        .rejects.toThrow("AUTHORIZATION_DEADLINE_INVALID");
    }
    const authorizations = await serviceRole.from("payment_authorizations").select("id")
      .in("workspace_id", [WORKSPACE_A, WORKSPACE_B]);
    expect(authorizations.error).toBeNull();
    expect(authorizations.data).toEqual([]);
  });

  it("records exact settlement facts and follow-ups once, ignores replay metadata, and denies conflicts", async () => {
    const input = settlementInput();
    const recorded = await repositories.recordSettlement(input);
    expect(recorded).toEqual({ outcome: "recorded", settlementId: expect.any(String), receiptDocumentId: expect.any(String) });
    await expect(repositories.recordSettlement({
      ...input, receiptTokenId: randomUUID(), receiptKeyVersion: 0,
      receiptVerifierHash: "ignored-on-replay", receiptExpiresAt: "2020-01-01T00:00:00.000Z",
      deliveries: [...input.deliveries].reverse(),
    })).resolves.toEqual({ ...recorded, outcome: "replayed" });
    for (const change of [
      { payer: `0x${"f".repeat(40)}` as const },
      { transactionHash: `0x${"1".repeat(64)}` as const },
      { blockNumber: "9007199254740994" },
      { workspaceId: WORKSPACE_B, invoiceKey: `0x${"b".repeat(64)}` as const },
    ]) {
      await expect(repositories.recordSettlement({ ...input, ...change })).rejects.toThrow("SETTLEMENT_CONFLICT");
    }

    const [settlements, receipts, links, deliveries, invoice] = await Promise.all([
      serviceRole.from("settlements").select("id,invoice_id,invoice_version_id,amount_atomic::text,block_number::text,block_time")
        .eq("workspace_id", WORKSPACE_A),
      serviceRole.from("receipt_documents").select("id,state,settlement_id,token_id").eq("workspace_id", WORKSPACE_A),
      serviceRole.from("access_links").select("purpose,receipt_document_id,token_id").eq("workspace_id", WORKSPACE_A),
      serviceRole.from("email_deliveries").select("normalized_recipient,roles,state,settlement_id,receipt_document_id")
        .eq("workspace_id", WORKSPACE_A).order("normalized_recipient"),
      serviceRole.from("invoices").select("commercial_state").eq("workspace_id", WORKSPACE_A).eq("id", INVOICE_A).single(),
    ]);
    for (const result of [settlements, receipts, links, deliveries, invoice]) expect(result.error).toBeNull();
    expect(settlements.data).toEqual([{
      id: recorded.settlementId, invoice_id: INVOICE_A, invoice_version_id: VERSION_A,
      amount_atomic: AMOUNT, block_number: input.blockNumber, block_time: "2026-09-05T00:00:00.123+00:00",
    }]);
    expect(receipts.data).toEqual([{
      id: recorded.receiptDocumentId, state: "pending", settlement_id: recorded.settlementId, token_id: input.receiptTokenId,
    }]);
    expect(links.data).toEqual([{
      purpose: "receipt-bearer", receipt_document_id: recorded.receiptDocumentId, token_id: input.receiptTokenId,
    }]);
    expect(deliveries.data).toEqual(input.deliveries.map((delivery) => ({
      normalized_recipient: delivery.normalizedRecipient, roles: delivery.roles, state: "pending",
      settlement_id: recorded.settlementId, receipt_document_id: recorded.receiptDocumentId,
    })));
    expect(invoice.data).toEqual({ commercial_state: "published" });
    await expect(repositories.recordPaymentAuthorization(authorizationInput())).rejects.toThrow("AUTHORIZATION_ALREADY_SETTLED");
    for (const table of ["settlements", "receipt_documents", "access_links", "email_deliveries"]) {
      const result = await serviceRole.from(table).select("id").eq("workspace_id", WORKSPACE_B);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it("denies cross-workspace settlement targets and rolls back invalid follow-ups", async () => {
    const input = settlementInput();
    await expect(repositories.recordSettlement({ ...input, workspaceId: WORKSPACE_B }))
      .rejects.toThrow("SETTLEMENT_FACTS_MISMATCH");
    await expect(repositories.recordSettlement({ ...input, amountAtomic: "2" }))
      .rejects.toThrow("SETTLEMENT_FACTS_MISMATCH");
    await expect(repositories.recordSettlement({ ...input, deliveries: [...input.deliveries].reverse() }))
      .rejects.toThrow("SETTLEMENT_DELIVERIES_INVALID");
    await expect(repositories.recordSettlement({ ...input, receiptKeyVersion: 0 }))
      .rejects.toThrow("SETTLEMENT_RECEIPT_METADATA_INVALID");
    for (const table of ["settlements", "receipt_documents", "access_links", "email_deliveries"]) {
      const result = await serviceRole.from(table).select("id").in("workspace_id", [WORKSPACE_A, WORKSPACE_B]);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it("requires explicit workspace scope before all three real adapters", async () => {
    await expect(repositories.allocateInvoiceSequence({ ...allocationInput, workspaceId: "" }))
      .rejects.toThrow("requires workspaceId");
    await expect(repositories.recordPaymentAuthorization({ ...authorizationInput(), workspaceId: " " }))
      .rejects.toThrow("requires workspaceId");
    await expect(repositories.recordSettlement({ ...settlementInput(), workspaceId: "" }))
      .rejects.toThrow("requires workspaceId");
    for (const table of ["invoice_sequences", "idempotency_requests", "payment_authorizations", "settlements"]) {
      const result = await serviceRole.from(table).select("workspace_id").in("workspace_id", [WORKSPACE_A, WORKSPACE_B]);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });
});

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRole = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACE_A = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "00000000-0000-4000-8000-000000000002";
const CLIENT_A = "00000000-0000-4000-8000-000000000101";
const CLIENT_B = "00000000-0000-4000-8000-000000000102";
const INVOICE_A = "00000000-0000-4000-8000-000000000201";
const INVOICE_B = "00000000-0000-4000-8000-000000000202";
const VERSION_A = "00000000-0000-4000-8000-000000000301";
const VERSION_B = "00000000-0000-4000-8000-000000000302";
const ATTEMPT_A = "00000000-0000-4000-8000-000000000401";
const ATTEMPT_B = "00000000-0000-4000-8000-000000000402";
const SETTLEMENT_A = "00000000-0000-4000-8000-000000000601";
const RECEIPT_A = "00000000-0000-4000-8000-000000000701";
const CONTRACT = `0x${"1".repeat(40)}`;
const PAYEE = `0x${"2".repeat(40)}`;
const INVOICE_KEY_A = `0x${"a".repeat(64)}`;
const INVOICE_KEY_B = `0x${"b".repeat(64)}`;
const COMMITMENT_A = `0x${"c".repeat(64)}`;

function executeSql(sql: string): string {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgresql://postgres:postgres@127.0.0.1:")) {
    throw new Error("Database fixtures require the local Supabase postgres URL");
  }
  const connection = new URL(databaseUrl);

  return execFileSync("psql", ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PGDATABASE: connection.pathname.slice(1),
      PGHOST: connection.hostname,
      PGPASSWORD: decodeURIComponent(connection.password),
      PGPORT: connection.port,
      PGUSER: decodeURIComponent(connection.username),
    },
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function expectSqlFailure(sql: string, expectedMarker: string): void {
  try {
    executeSql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string | Buffer }).stderr ?? "");
    expect(stderr).toContain(expectedMarker);
    return;
  }
  throw new Error(`Expected SQL to fail with ${expectedMarker}`);
}

function resetFixtures(): void {
  executeSql(`
    truncate table
      public.email_deliveries,
      public.access_links,
      public.receipt_documents,
      public.settlements,
      public.payment_authorizations,
      public.publication_attempts,
      public.invoice_versions,
      public.invoices,
      public.idempotency_requests,
      public.audit_events,
      public.connector_rate_limits,
      public.connector_tokens,
      public.auth_nonces,
      public.invoice_sequences,
      public.clients,
      public.sender_profiles,
      public.workspaces
    cascade;

    insert into public.workspaces (id, owner_wallet) values
      ('${WORKSPACE_A}', '0x${"3".repeat(40)}'),
      ('${WORKSPACE_B}', '0x${"4".repeat(40)}');

    insert into public.clients (id, workspace_id, alias, business_name, billing_address, contact_email) values
      ('${CLIENT_A}', '${WORKSPACE_A}', 'alpha', 'Alpha Client', '{}', 'alpha@example.test'),
      ('${CLIENT_B}', '${WORKSPACE_B}', 'beta', 'Beta Client', '{}', 'beta@example.test');

    insert into public.invoices (
      id, workspace_id, client_id, commercial_state, invoice_number, published_at, payable_until
    ) values
      ('${INVOICE_A}', '${WORKSPACE_A}', '${CLIENT_A}', 'published', 'PAYR-2026-0001', now() - interval '1 day', date_trunc('second', now() + interval '30 days')),
      ('${INVOICE_B}', '${WORKSPACE_B}', '${CLIENT_B}', 'published', 'PAYR-2026-0002', now() - interval '1 day', date_trunc('second', now() + interval '30 days'));

    insert into public.invoice_versions (
      id, workspace_id, invoice_id, version_number, sender_snapshot, client_snapshot, line_items,
      issue_date, due_date, payable_until, payable_until_second, amount_decimal, amount_atomic,
      chain_id, contract_address, payee, frozen_at
    ) values
      ('${VERSION_A}', '${WORKSPACE_A}', '${INVOICE_A}', 1, '{}', '{}', '[]', current_date, current_date + 7,
       date_trunc('second', now() + interval '30 days'), extract(epoch from date_trunc('second', now() + interval '30 days'))::bigint,
       '1', 1000000000000000000, 5042002, '${CONTRACT}', '${PAYEE}', now()),
      ('${VERSION_B}', '${WORKSPACE_B}', '${INVOICE_B}', 1, '{}', '{}', '[]', current_date, current_date + 7,
       date_trunc('second', now() + interval '30 days'), extract(epoch from date_trunc('second', now() + interval '30 days'))::bigint,
       '2', 2000000000000000000, 5042002, '${CONTRACT}', '${PAYEE}', now());

    insert into public.publication_attempts (
      id, workspace_id, invoice_id, invoice_version_id, state, request_fingerprint,
      sequence_year, sequence_value, invoice_number, invoice_key, publication_salt, storage_key,
      invoice_token_id, invoice_key_version, invoice_verifier_hash, invoice_link_expires_at,
      invoice_data_hash, pdf_content_hash, document_commitment, pdf_filename, pdf_byte_length,
      pdf_content_type, stored_at, finalized_at
    ) values
      ('${ATTEMPT_A}', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_A}', 'finalized', '${"1".repeat(64)}',
       2026, 1, 'PAYR-2026-0001', '${INVOICE_KEY_A}', '0x${"5".repeat(64)}', 'workspace/a/invoice.pdf',
       '00000000-0000-4000-8000-000000000501', 1, '${"6".repeat(64)}', now() + interval '60 days',
       '0x${"7".repeat(64)}', '0x${"8".repeat(64)}', '${COMMITMENT_A}', 'PAYR-2026-0001.pdf', 100,
       'application/pdf', now(), now()),
      ('${ATTEMPT_B}', '${WORKSPACE_B}', '${INVOICE_B}', '${VERSION_B}', 'finalized', '${"2".repeat(64)}',
       2026, 2, 'PAYR-2026-0002', '${INVOICE_KEY_B}', '0x${"9".repeat(64)}', 'workspace/b/invoice.pdf',
       '00000000-0000-4000-8000-000000000502', 1, '${"a".repeat(64)}', now() + interval '60 days',
       '0x${"b".repeat(64)}', '0x${"d".repeat(64)}', '0x${"e".repeat(64)}', 'PAYR-2026-0002.pdf', 200,
       'application/pdf', now(), now());
  `);
}

function seedSettlementAndReadyReceipt(): void {
  executeSql(`
    insert into public.settlements (
      id, workspace_id, invoice_id, invoice_version_id, publication_attempt_id,
      chain_id, contract_address, invoice_key, transaction_hash, log_index,
      block_number, block_time, document_commitment, payer, payee, amount_atomic
    ) values (
      '${SETTLEMENT_A}', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_A}', '${ATTEMPT_A}',
      5042002, '${CONTRACT}', '${INVOICE_KEY_A}', '0x${"d".repeat(64)}', 0,
      100, '2026-09-05T00:00:00Z', '${COMMITMENT_A}', '0x${"e".repeat(40)}', '${PAYEE}', 1000000000000000000
    );

    insert into public.receipt_documents (
      id, workspace_id, settlement_id, invoice_id, invoice_version_id,
      token_id, key_version, verifier_hash, link_expires_at, state,
      storage_key, byte_length, content_type, content_hash, pdf_filename, ready_at
    ) values (
      '${RECEIPT_A}', '${WORKSPACE_A}', '${SETTLEMENT_A}', '${INVOICE_A}', '${VERSION_A}',
      '00000000-0000-4000-8000-000000000801', 1, '${"f".repeat(64)}', now() + interval '30 days', 'ready',
      'workspace/a/receipt.pdf', 120, 'application/pdf', '0x${"1".repeat(64)}', 'PAYR-2026-0001-receipt.pdf', now()
    );
  `);
}

function settlementParameters() {
  return {
    p_workspace_id: WORKSPACE_A,
    p_chain_id: 5_042_002,
    p_contract_address: CONTRACT,
    p_invoice_key: INVOICE_KEY_A,
    p_transaction_hash: `0x${"d".repeat(64)}`,
    p_log_index: 0,
    p_block_number: "100",
    p_block_time: "2026-09-05T00:00:00.000Z",
    p_document_commitment: COMMITMENT_A,
    p_payer: `0x${"e".repeat(40)}`,
    p_payee: PAYEE,
    p_amount_atomic: "1000000000000000000",
    p_receipt_token_id: "00000000-0000-4000-8000-000000000801",
    p_receipt_key_version: 1,
    p_receipt_verifier_hash: "f".repeat(64),
    p_receipt_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    p_deliveries: [
      { messageKind: "receipt", normalizedRecipient: "alpha@example.test", roles: ["issuer"] },
      { messageKind: "receipt", normalizedRecipient: "client@example.test", roles: ["issuer", "client"] },
    ],
  };
}

const coreTables = [
  "workspaces",
  "sender_profiles",
  "clients",
  "invoice_sequences",
  "auth_nonces",
  "connector_tokens",
  "connector_rate_limits",
  "audit_events",
  "idempotency_requests",
  "invoices",
  "invoice_versions",
  "publication_attempts",
  "access_links",
  "payment_authorizations",
  "settlements",
  "receipt_documents",
  "email_deliveries",
  "reconciliation_cursors",
] as const;

describe("Payr database security contract", () => {
  beforeEach(() => {
    resetFixtures();
  });

  it("exposes all 18 core records to service-role reads", async () => {
    for (const table of coreTables) {
      const { error } = await serviceRole.from(table).select("*").limit(0);
      expect(error, table).toBeNull();
    }
  });

  it("allocates sequences atomically and replays only an exact idempotent request", async () => {
    const parameters = {
      p_workspace_id: WORKSPACE_A,
      p_sequence_year: 2026,
      p_idempotency_key: "publish-one",
      p_request_fingerprint: "f".repeat(64),
    };

    const first = await serviceRole.rpc("payr_allocate_invoice_sequence_v1", parameters);
    const replay = await serviceRole.rpc("payr_allocate_invoice_sequence_v1", parameters);
    const conflict = await serviceRole.rpc("payr_allocate_invoice_sequence_v1", {
      ...parameters,
      p_request_fingerprint: "e".repeat(64),
    });

    expect(first.error).toBeNull();
    expect(first.data).toEqual([{ outcome: "allocated", sequence_value: 1 }]);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual([{ outcome: "replayed", sequence_value: 1 }]);
    expect(conflict.error).toBeNull();
    expect(conflict.data).toEqual([{ outcome: "conflict", sequence_value: null }]);

    const { data: persisted, error } = await serviceRole
      .from("idempotency_requests")
      .select("request_fingerprint,result_descriptor")
      .eq("workspace_id", WORKSPACE_A)
      .eq("idempotency_key", "publish-one")
      .single();
    expect(error).toBeNull();
    expect(persisted).toEqual({ request_fingerprint: "f".repeat(64), result_descriptor: { state: "1" } });
  });

  it("allocates concurrent sequence requests without duplicates or reuse", async () => {
    const allocations = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        serviceRole.rpc("payr_allocate_invoice_sequence_v1", {
          p_workspace_id: WORKSPACE_A,
          p_sequence_year: 2026,
          p_idempotency_key: `concurrent-${index}`,
          p_request_fingerprint: index.toString(16).padStart(64, "0"),
        }),
      ),
    );

    expect(allocations.every(({ error }) => error === null)).toBe(true);
    const values = allocations.map(({ data }) => (data as Array<{ sequence_value: number }>)[0]!.sequence_value);
    expect([...new Set(values)].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    const replay = await serviceRole.rpc("payr_allocate_invoice_sequence_v1", {
      p_workspace_id: WORKSPACE_A,
      p_sequence_year: 2026,
      p_idempotency_key: "concurrent-3",
      p_request_fingerprint: "3".padStart(64, "0"),
    });
    const next = await serviceRole.rpc("payr_allocate_invoice_sequence_v1", {
      p_workspace_id: WORKSPACE_A,
      p_sequence_year: 2026,
      p_idempotency_key: "after-concurrency",
      p_request_fingerprint: "f".repeat(64),
    });

    expect(replay.data).toEqual([
      { outcome: "replayed", sequence_value: (allocations[3]!.data as Array<{ sequence_value: number }>)[0]!.sequence_value },
    ]);
    expect(next.data).toEqual([{ outcome: "allocated", sequence_value: 21 }]);
  });

  it("pins the four enums and the three non-overloaded hardened RPCs", () => {
    const enums = executeSql(`
      select enum_type.typname || ':' || string_agg(enum_value.enumlabel, ',' order by enum_value.enumsortorder)
      from pg_catalog.pg_type as enum_type
      join pg_catalog.pg_enum as enum_value on enum_value.enumtypid = enum_type.oid
      join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
      where namespace.nspname = 'public'
        and enum_type.typname in ('commercial_state', 'publication_state', 'receipt_document_state', 'delivery_state')
      group by enum_type.typname
      order by enum_type.typname;
    `).split("\n");
    expect(enums).toEqual([
      "commercial_state:draft,published,voided,expired",
      "delivery_state:pending,sending,retry_wait,sent,manual_review,failed",
      "publication_state:reserved,rendering,stored,finalized,failed",
      "receipt_document_state:pending,rendering,retry_wait,ready,failed",
    ]);

    const tableSecurity = executeSql(`
      select
        count(*) filter (where relation.relrowsecurity)::text || '|' || count(*)::text || '|' ||
        (select count(*)::text from pg_catalog.pg_policies as policy where policy.schemaname = 'public'
          and policy.tablename = any(array[${coreTables.map((table) => `'${table}'`).join(",")}]))
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relname = any(array[${coreTables.map((table) => `'${table}'`).join(",")}]);
    `);
    expect(tableSecurity).toBe("18|18|0");

    const rpcMetadata = executeSql(`
      select procedure.proname || '|' || pg_catalog.oidvectortypes(procedure.proargtypes) || '|' ||
        procedure.prosecdef::text || '|' || pg_catalog.array_to_string(procedure.proconfig, ',') || '|' ||
        pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')::text || '|' ||
        pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')::text || '|' ||
        pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')::text
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'payr_allocate_invoice_sequence_v1',
          'payr_record_payment_authorization_v1',
          'payr_record_settlement_v1'
        )
      order by procedure.proname;
    `).split("\n");

    expect(rpcMetadata).toEqual([
      'payr_allocate_invoice_sequence_v1|uuid, integer, text, text|true|search_path=""|false|false|true',
      'payr_record_payment_authorization_v1|uuid, uuid, uuid, uuid, text, bigint, text, text, text, numeric, text, text, text, text, text, bigint, bigint|true|search_path=""|false|false|true',
      'payr_record_settlement_v1|uuid, bigint, text, text, text, integer, numeric, timestamp with time zone, text, text, text, numeric, uuid, integer, text, timestamp with time zone, jsonb|true|search_path=""|false|false|true',
    ]);
  });

  it("rejects cross-workspace foreign keys at every frozen tenant edge", () => {
    expectSqlFailure(
      `insert into public.invoices (id, workspace_id, client_id) values
       ('00000000-0000-4000-8000-000000000901', '${WORKSPACE_A}', '${CLIENT_B}');`,
      "invoices_client_fk",
    );

    expectSqlFailure(
      `insert into public.publication_attempts (
         id, workspace_id, invoice_id, invoice_version_id, request_fingerprint,
         sequence_year, sequence_value, invoice_number, invoice_key, publication_salt, storage_key,
         invoice_token_id, invoice_key_version, invoice_verifier_hash, invoice_link_expires_at
       ) values (
         '00000000-0000-4000-8000-000000000902', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_B}', '${"3".repeat(64)}',
         2026, 3, 'PAYR-2026-0003', '0x${"3".repeat(64)}', '0x${"4".repeat(64)}', 'workspace/c/invoice.pdf',
         '00000000-0000-4000-8000-000000000903', 1, '${"5".repeat(64)}', now() + interval '30 days'
       );`,
      "publication_attempts_version_fk",
    );

    expectSqlFailure(
      `insert into public.settlements (
         id, workspace_id, invoice_id, invoice_version_id, publication_attempt_id,
         chain_id, contract_address, invoice_key, transaction_hash, log_index,
         block_number, block_time, document_commitment, payer, payee, amount_atomic
       ) values (
         '00000000-0000-4000-8000-000000000904', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_B}', '${ATTEMPT_A}',
         5042002, '${CONTRACT}', '0x${"3".repeat(64)}', '0x${"4".repeat(64)}', 0,
         1, now(), '0x${"5".repeat(64)}', '0x${"6".repeat(40)}', '${PAYEE}', 1
       );`,
      "settlements_version_fk",
    );

    seedSettlementAndReadyReceipt();
    expectSqlFailure(
      `insert into public.receipt_documents (
         id, workspace_id, settlement_id, invoice_id, invoice_version_id,
         token_id, key_version, verifier_hash, link_expires_at
       ) values (
         '00000000-0000-4000-8000-000000000905', '${WORKSPACE_B}', '${SETTLEMENT_A}', '${INVOICE_B}', '${VERSION_B}',
         '00000000-0000-4000-8000-000000000906', 1, '${"7".repeat(64)}', now() + interval '30 days'
       );`,
      "receipt_documents_settlement_fk",
    );
  });

  it("rejects invalid state, time, money, artifact, and result-descriptor facts", () => {
    expectSqlFailure(
      `insert into public.invoices (id, workspace_id, client_id, commercial_state)
       values ('00000000-0000-4000-8000-000000000911', '${WORKSPACE_A}', '${CLIENT_A}', 'published');`,
      "invoices_state_facts",
    );
    expectSqlFailure(
      `insert into public.invoice_versions (
         id, workspace_id, invoice_id, version_number, issue_date, due_date
       ) values (
         '00000000-0000-4000-8000-000000000912', '${WORKSPACE_A}', '${INVOICE_A}', 2, current_date, current_date - 1
       );`,
      "invoice_versions_date_order",
    );
    expectSqlFailure(
      `insert into public.invoice_versions (
         id, workspace_id, invoice_id, version_number, amount_decimal, amount_atomic
       ) values (
         '00000000-0000-4000-8000-000000000913', '${WORKSPACE_A}', '${INVOICE_A}', 2, '0', 0
       );`,
      "invoice_versions_amount_decimal_format",
    );
    expectSqlFailure(
      `insert into public.invoice_versions (
         id, workspace_id, invoice_id, version_number, amount_decimal, amount_atomic
       ) values (
         '00000000-0000-4000-8000-000000000913', '${WORKSPACE_A}', '${INVOICE_A}', 2, '1', 2
       );`,
      "invoice_versions_amount_consistent",
    );
    expectSqlFailure(
      `insert into public.publication_attempts (
         id, workspace_id, invoice_id, invoice_version_id, state, request_fingerprint,
         sequence_year, sequence_value, invoice_number, invoice_key, publication_salt, storage_key,
         invoice_token_id, invoice_key_version, invoice_verifier_hash, invoice_link_expires_at,
         invoice_data_hash
       ) values (
         '00000000-0000-4000-8000-000000000914', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_A}', 'stored', '${"3".repeat(64)}',
         2026, 3, 'PAYR-2026-0003', '0x${"3".repeat(64)}', '0x${"4".repeat(64)}', 'workspace/c/invoice.pdf',
         '00000000-0000-4000-8000-000000000915', 1, '${"5".repeat(64)}', now() + interval '30 days',
         '0x${"6".repeat(64)}'
       );`,
      "publication_attempts_artifact_group",
    );

    executeSql(`
      insert into public.settlements (
        id, workspace_id, invoice_id, invoice_version_id, publication_attempt_id,
        chain_id, contract_address, invoice_key, transaction_hash, log_index,
        block_number, block_time, document_commitment, payer, payee, amount_atomic
      ) values (
        '${SETTLEMENT_A}', '${WORKSPACE_A}', '${INVOICE_A}', '${VERSION_A}', '${ATTEMPT_A}',
        5042002, '${CONTRACT}', '${INVOICE_KEY_A}', '0x${"d".repeat(64)}', 0,
        100, now(), '${COMMITMENT_A}', '0x${"e".repeat(40)}', '${PAYEE}', 1000000000000000000
      );
    `);
    expectSqlFailure(
      `insert into public.receipt_documents (
         id, workspace_id, settlement_id, invoice_id, invoice_version_id,
         token_id, key_version, verifier_hash, link_expires_at, state, ready_at
       ) values (
         '${RECEIPT_A}', '${WORKSPACE_A}', '${SETTLEMENT_A}', '${INVOICE_A}', '${VERSION_A}',
         '00000000-0000-4000-8000-000000000916', 1, '${"7".repeat(64)}', now() + interval '30 days', 'ready', now()
       );`,
      "receipt_documents_ready_artifact",
    );

    for (const [key, descriptor] of [
      ["url", `'{"url":"https://example.test/private"}'::jsonb`],
      ["token", `'{"ids":{"receiptToken":"00000000-0000-4000-8000-000000000999"}}'::jsonb`],
      ["hash", `'{"hashes":{"invoice":"ABC"}}'::jsonb`],
      ["filename", `'{"filenames":{"invoice":"../invoice.pdf"}}'::jsonb`],
    ]) {
      expectSqlFailure(
        `insert into public.idempotency_requests (
           id, workspace_id, operation, idempotency_key, request_fingerprint, result_descriptor
         ) values (
           '00000000-0000-4000-8000-000000000917', '${WORKSPACE_A}', 'test', '${key}', '${"8".repeat(64)}', ${descriptor}
         );`,
        "idempotency_requests_safe_result",
      );
    }
  });

  it("blocks update and delete of every immutable database record", () => {
    seedSettlementAndReadyReceipt();
    const hostileMutations = [
      [`update public.invoice_versions set memo = 'changed' where id = '${VERSION_A}';`, "FROZEN_INVOICE_VERSION"],
      [`delete from public.invoice_versions where id = '${VERSION_A}';`, "FROZEN_INVOICE_VERSION"],
      [`update public.publication_attempts set pdf_byte_length = 999 where id = '${ATTEMPT_A}';`, "FINALIZED_PUBLICATION_IMMUTABLE"],
      [`delete from public.publication_attempts where id = '${ATTEMPT_A}';`, "FINALIZED_PUBLICATION_IMMUTABLE"],
      [`update public.settlements set amount_atomic = 2 where id = '${SETTLEMENT_A}';`, "SETTLEMENT_IMMUTABLE"],
      [`delete from public.settlements where id = '${SETTLEMENT_A}';`, "SETTLEMENT_IMMUTABLE"],
      [`update public.receipt_documents set content_hash = '0x${"2".repeat(64)}' where id = '${RECEIPT_A}';`, "READY_RECEIPT_IMMUTABLE"],
      [`delete from public.receipt_documents where id = '${RECEIPT_A}';`, "READY_RECEIPT_IMMUTABLE"],
    ] as const;

    for (const [sql, marker] of hostileMutations) {
      expectSqlFailure(sql, marker);
    }
  });

  it("records an authorization only for the exact payable frozen tuple and strict deadline", async () => {
    const { data: version, error: versionError } = await serviceRole
      .from("invoice_versions")
      .select("payable_until_second")
      .eq("id", VERSION_A)
      .single();
    expect(versionError).toBeNull();
    const payableUntilSecond = Number(version!.payable_until_second);
    const issuedAtSecond = Math.floor(Date.now() / 1_000);
    const parameters = {
      p_workspace_id: WORKSPACE_A,
      p_authorization_id: "00000000-0000-4000-8000-000000000921",
      p_invoice_id: INVOICE_A,
      p_invoice_version_id: VERSION_A,
      p_invoice_key: INVOICE_KEY_A,
      p_chain_id: 5_042_002,
      p_contract_address: CONTRACT,
      p_document_commitment: COMMITMENT_A,
      p_payee: PAYEE,
      p_amount_atomic: "1000000000000000000",
      p_attestor: `0x${"3".repeat(40)}`,
      p_typed_data_digest: `0x${"4".repeat(64)}`,
      p_signature_hash: `0x${"5".repeat(64)}`,
      p_signer_mode: "local-testnet",
      p_policy_result: "allowed",
      p_issued_at_second: issuedAtSecond,
      p_authorization_valid_until: issuedAtSecond + 600,
    };

    const recorded = await serviceRole.rpc("payr_record_payment_authorization_v1", parameters);
    expect(recorded.error).toBeNull();
    expect(recorded.data).toEqual([{ outcome: "recorded", authorization_id: parameters.p_authorization_id }]);

    const equality = await serviceRole.rpc("payr_record_payment_authorization_v1", {
      ...parameters,
      p_authorization_id: "00000000-0000-4000-8000-000000000922",
      p_authorization_valid_until: payableUntilSecond,
    });
    expect(equality.error?.message).toContain("AUTHORIZATION_DEADLINE_INVALID");

    const wrongAmount = await serviceRole.rpc("payr_record_payment_authorization_v1", {
      ...parameters,
      p_authorization_id: "00000000-0000-4000-8000-000000000923",
      p_amount_atomic: "2",
    });
    expect(wrongAmount.error?.message).toContain("AUTHORIZATION_FACTS_MISMATCH");

    seedSettlementAndReadyReceipt();
    const settled = await serviceRole.rpc("payr_record_payment_authorization_v1", {
      ...parameters,
      p_authorization_id: "00000000-0000-4000-8000-000000000924",
    });
    expect(settled.error?.message).toContain("AUTHORIZATION_ALREADY_SETTLED");

    executeSql(`
      update public.invoices
      set commercial_state = 'voided', voided_at = now(), updated_at = now()
      where id = '${INVOICE_A}';
    `);
    const voided = await serviceRole.rpc("payr_record_payment_authorization_v1", {
      ...parameters,
      p_authorization_id: "00000000-0000-4000-8000-000000000925",
    });
    expect(voided.error?.message).toContain("AUTHORIZATION_NOT_PAYABLE");
  });

  it("records settlement follow-ups atomically and replays immutable facts only", async () => {
    const parameters = settlementParameters();
    const recorded = await serviceRole.rpc("payr_record_settlement_v1", parameters);
    expect(recorded.error).toBeNull();
    expect(recorded.data).toEqual([
      expect.objectContaining({ outcome: "recorded", settlement_id: expect.any(String), receipt_document_id: expect.any(String) }),
    ]);
    const result = (recorded.data as Array<{ settlement_id: string; receipt_document_id: string }>)[0]!;

    const [settlements, receipts, links, deliveries] = await Promise.all([
      serviceRole.from("settlements").select("*").eq("id", result.settlement_id),
      serviceRole.from("receipt_documents").select("state,settlement_id,token_id").eq("id", result.receipt_document_id),
      serviceRole.from("access_links").select("purpose,receipt_document_id,token_id").eq("receipt_document_id", result.receipt_document_id),
      serviceRole
        .from("email_deliveries")
        .select("normalized_recipient,roles,state,settlement_id,receipt_document_id")
        .eq("settlement_id", result.settlement_id)
        .order("normalized_recipient"),
    ]);
    expect(settlements.error).toBeNull();
    expect(settlements.data).toHaveLength(1);
    expect(receipts.data).toEqual([
      { state: "pending", settlement_id: result.settlement_id, token_id: parameters.p_receipt_token_id },
    ]);
    expect(links.data).toEqual([
      { purpose: "receipt-bearer", receipt_document_id: result.receipt_document_id, token_id: parameters.p_receipt_token_id },
    ]);
    expect(deliveries.data).toEqual([
      {
        normalized_recipient: "alpha@example.test",
        roles: ["issuer"],
        state: "pending",
        settlement_id: result.settlement_id,
        receipt_document_id: result.receipt_document_id,
      },
      {
        normalized_recipient: "client@example.test",
        roles: ["issuer", "client"],
        state: "pending",
        settlement_id: result.settlement_id,
        receipt_document_id: result.receipt_document_id,
      },
    ]);

    const replay = await serviceRole.rpc("payr_record_settlement_v1", {
      ...parameters,
      p_receipt_token_id: "00000000-0000-4000-8000-000000000899",
      p_receipt_key_version: 0,
      p_receipt_verifier_hash: "regenerated-metadata-is-ignored",
      p_receipt_expires_at: "2020-01-01T00:00:00.000Z",
      p_deliveries: [...parameters.p_deliveries].reverse(),
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual([
      { outcome: "replayed", settlement_id: result.settlement_id, receipt_document_id: result.receipt_document_id },
    ]);

    for (const conflictParameters of [
      { ...parameters, p_payer: `0x${"f".repeat(40)}` },
      { ...parameters, p_transaction_hash: `0x${"1".repeat(64)}` },
      {
        ...parameters,
        p_workspace_id: WORKSPACE_B,
        p_invoice_key: INVOICE_KEY_B,
        p_document_commitment: `0x${"e".repeat(64)}`,
        p_amount_atomic: "2000000000000000000",
      },
    ]) {
      const conflict = await serviceRole.rpc("payr_record_settlement_v1", conflictParameters);
      expect(conflict.error?.message).toContain("SETTLEMENT_CONFLICT");
    }

    const sideEffectCounts = await Promise.all(
      ["settlements", "receipt_documents", "access_links", "email_deliveries"].map(async (table) => {
        const { count, error } = await serviceRole.from(table).select("*", { count: "exact", head: true });
        expect(error, table).toBeNull();
        return count;
      }),
    );
    expect(sideEffectCounts).toEqual([1, 1, 1, 2]);
  });

  it("fails a new settlement atomically when any follow-up is invalid", async () => {
    const invalid = await serviceRole.rpc("payr_record_settlement_v1", {
      ...settlementParameters(),
      p_deliveries: [
        { messageKind: "receipt", normalizedRecipient: "z@example.test", roles: ["client"] },
        { messageKind: "receipt", normalizedRecipient: "a@example.test", roles: ["issuer"] },
      ],
    });
    expect(invalid.error?.message).toContain("SETTLEMENT_DELIVERIES_INVALID");

    for (const table of ["settlements", "receipt_documents", "access_links", "email_deliveries"]) {
      const { count, error } = await serviceRole.from(table).select("*", { count: "exact", head: true });
      expect(error, table).toBeNull();
      expect(count, table).toBe(0);
    }
  });

  it("denies anon and authenticated access to every table and privileged RPC", async () => {
    const anon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `payr-db-${randomUUID()}@example.test`;
    const password = `Db-${randomUUID()}-Aa1!`;
    const created = await serviceRole.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const authenticated = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const signedIn = await authenticated.auth.signInWithPassword({ email, password });
      expect(signedIn.error).toBeNull();

      for (const client of [anon, authenticated]) {
        for (const table of coreTables) {
          const { error } = await client.from(table).select("*").limit(1);
          expect(error, table).not.toBeNull();
        }

        const rpcCalls = [
          client.rpc("payr_allocate_invoice_sequence_v1", {
            p_workspace_id: WORKSPACE_A,
            p_sequence_year: 2026,
            p_idempotency_key: "denied",
            p_request_fingerprint: "1".repeat(64),
          }),
          client.rpc("payr_record_payment_authorization_v1", {
            p_workspace_id: WORKSPACE_A,
            p_authorization_id: "00000000-0000-4000-8000-000000000931",
            p_invoice_id: INVOICE_A,
            p_invoice_version_id: VERSION_A,
            p_invoice_key: INVOICE_KEY_A,
            p_chain_id: 5_042_002,
            p_contract_address: CONTRACT,
            p_document_commitment: COMMITMENT_A,
            p_payee: PAYEE,
            p_amount_atomic: "1000000000000000000",
            p_attestor: `0x${"3".repeat(40)}`,
            p_typed_data_digest: `0x${"4".repeat(64)}`,
            p_signature_hash: `0x${"5".repeat(64)}`,
            p_signer_mode: "local-testnet",
            p_policy_result: "allowed",
            p_issued_at_second: Math.floor(Date.now() / 1_000),
            p_authorization_valid_until: Math.floor(Date.now() / 1_000) + 600,
          }),
          client.rpc("payr_record_settlement_v1", settlementParameters()),
        ];
        for (const result of await Promise.all(rpcCalls)) {
          expect(result.error).not.toBeNull();
        }
      }
    } finally {
      if (created.data.user) {
        await serviceRole.auth.admin.deleteUser(created.data.user.id);
      }
    }
  });

  it("denies direct service-role writes to core records", async () => {
    const inserted = await serviceRole.from("workspaces").insert({
      id: "00000000-0000-4000-8000-000000000941",
      owner_wallet: `0x${"9".repeat(40)}`,
    });
    const updated = await serviceRole.from("workspaces").update({ updated_at: new Date().toISOString() }).eq("id", WORKSPACE_A);
    const deleted = await serviceRole.from("workspaces").delete().eq("id", WORKSPACE_A);

    expect(inserted.error).not.toBeNull();
    expect(updated.error).not.toBeNull();
    expect(deleted.error).not.toBeNull();
  });

  it("recreates a private PDF-only 10 MiB bucket and denies public list/read", async () => {
    const bucket = await serviceRole.storage.getBucket("documents");
    expect(bucket.error).toBeNull();
    expect(bucket.data).toMatchObject({
      id: "documents",
      name: "documents",
      public: false,
      file_size_limit: 10_485_760,
      allowed_mime_types: ["application/pdf"],
    });

    const objectPath = `security/${randomUUID()}.pdf`;
    const uploaded = await serviceRole.storage
      .from("documents")
      .upload(objectPath, new TextEncoder().encode("%PDF-1.7\n%%EOF"), { contentType: "application/pdf", upsert: false });
    expect(uploaded.error).toBeNull();

    const anon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const listed = await anon.storage.from("documents").list("security");
    const downloaded = await anon.storage.from("documents").download(objectPath);
    const publicObjectUrl = anon.storage.from("documents").getPublicUrl(objectPath).data.publicUrl;
    const publicResponse = await fetch(publicObjectUrl);

    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([]);
    expect(downloaded.error).not.toBeNull();
    expect(publicResponse.ok).toBe(false);

    const email = `payr-storage-${randomUUID()}@example.test`;
    const password = `Storage-${randomUUID()}-Aa1!`;
    const created = await serviceRole.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const authenticated = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const signedIn = await authenticated.auth.signInWithPassword({ email, password });
      expect(signedIn.error).toBeNull();
      const authenticatedList = await authenticated.storage.from("documents").list("security");
      const authenticatedDownload = await authenticated.storage.from("documents").download(objectPath);
      expect(authenticatedList.error).toBeNull();
      expect(authenticatedList.data).toEqual([]);
      expect(authenticatedDownload.error).not.toBeNull();
    } finally {
      if (created.data.user) {
        await serviceRole.auth.admin.deleteUser(created.data.user.id);
      }
    }

    const wrongType = await serviceRole.storage
      .from("documents")
      .upload(`security/${randomUUID()}.txt`, new TextEncoder().encode("not a pdf"), {
        contentType: "text/plain",
        upsert: false,
      });
    const oversized = await serviceRole.storage
      .from("documents")
      .upload(`security/${randomUUID()}.pdf`, new Uint8Array(10_485_761), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(wrongType.error).not.toBeNull();
    expect(oversized.error).not.toBeNull();
  });
});

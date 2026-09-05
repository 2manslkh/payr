import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "./admin";
import {
  createPayrRepositories,
  type AllocateInvoiceSequenceInput,
  type PayrRepositories,
  type RecordPaymentAuthorizationInput,
  type RecordSettlementInput,
  type RpcClient,
  type RpcResult,
} from "./repositories";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ kind: "admin-client" })),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const AUTHORIZATION_ID = "00000000-0000-4000-8000-000000000021";
const SETTLEMENT_ID = "00000000-0000-4000-8000-000000000010";
const RECEIPT_DOCUMENT_ID = "00000000-0000-4000-8000-000000000011";

const allocationInput: AllocateInvoiceSequenceInput = {
  workspaceId: WORKSPACE_ID,
  sequenceYear: 2026,
  idempotencyKey: "publish-1",
  requestFingerprint: "a".repeat(64),
};

const authorizationInput: RecordPaymentAuthorizationInput = {
  workspaceId: WORKSPACE_ID,
  authorizationId: AUTHORIZATION_ID,
  invoiceId: "00000000-0000-4000-8000-000000000201",
  invoiceVersionId: "00000000-0000-4000-8000-000000000301",
  invoiceKey: `0x${"2".repeat(64)}`,
  chainId: 5_042_002,
  contractAddress: "0x1111111111111111111111111111111111111111",
  documentCommitment: `0x${"4".repeat(64)}`,
  payee: "0x3333333333333333333333333333333333333333",
  amountAtomic: "1000000000000000000",
  attestor: "0x4444444444444444444444444444444444444444",
  typedDataDigest: `0x${"5".repeat(64)}`,
  signatureHash: `0x${"6".repeat(64)}`,
  signerMode: "local-testnet",
  policyResult: "allowed",
  issuedAtSecond: 1_788_566_400,
  authorizationValidUntil: 1_788_567_000,
};

const settlementInput: RecordSettlementInput = {
  workspaceId: WORKSPACE_ID,
  chainId: 5_042_002,
  contractAddress: "0x1111111111111111111111111111111111111111",
  invoiceKey: `0x${"2".repeat(64)}`,
  transactionHash: `0x${"3".repeat(64)}`,
  logIndex: 0,
  blockNumber: "123",
  blockTime: "2026-09-05T00:00:00.000Z",
  documentCommitment: `0x${"4".repeat(64)}`,
  payer: "0x2222222222222222222222222222222222222222",
  payee: "0x3333333333333333333333333333333333333333",
  amountAtomic: "1000000000000000000",
  receiptTokenId: "00000000-0000-4000-8000-000000000020",
  receiptKeyVersion: 1,
  receiptVerifierHash: "5".repeat(64),
  receiptExpiresAt: "2026-10-05T00:00:00.000Z",
  deliveries: [
    {
      messageKind: "receipt",
      normalizedRecipient: "client@example.test",
      roles: ["client"],
    },
  ],
};

function createRpcStub(result: RpcResult): {
  calls: Array<{ name: string; parameters: Record<string, unknown> }>;
  client: RpcClient;
} {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc(name, parameters) {
        calls.push({ name, parameters });
        return Promise.resolve(result);
      },
    },
  };
}

const repositoryCalls: Array<(repositories: PayrRepositories) => Promise<unknown>> = [
  (repositories) => repositories.allocateInvoiceSequence(allocationInput),
  (repositories) => repositories.recordPaymentAuthorization(authorizationInput),
  (repositories) => repositories.recordSettlement(settlementInput),
];

describe("Supabase admin client", () => {
  beforeEach(() => {
    createClientMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a runtime-only client with browser session behavior disabled", () => {
    const client = createSupabaseAdminClient({
      SUPABASE_URL: "http://127.0.0.1:57321",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
    });

    expect(client).toEqual({ kind: "admin-client" });
    expect(createClientMock).toHaveBeenCalledWith("http://127.0.0.1:57321", "local-service-role-key", {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  });

  it("parses required configuration only when the factory is called", () => {
    expect(() => createSupabaseAdminClient({})).toThrow(
      "Supabase admin client requires runtime URL and service-role configuration",
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("imports without configuration and reads the environment anew at call time", async () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    vi.resetModules();
    const { createSupabaseAdminClient: factory } = await import("./admin");
    expect(createClientMock).not.toHaveBeenCalled();
    expect(() => factory()).toThrow("requires runtime URL and service-role configuration");

    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:57321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "runtime-test-key");
    factory();
    expect(createClientMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:57321", "runtime-test-key", expect.any(Object),
    );
  });

  it.each(["not-a-url", "file:///private", "ftp://example.test", "https://user:secret@example.test"])(
    "rejects invalid admin URL configuration without echoing it: %s",
    (url) => {
      expect(() => createSupabaseAdminClient({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      })).toThrow("Supabase admin client requires a valid runtime URL");
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it("rejects whitespace-only credentials", () => {
    expect(() => createSupabaseAdminClient({
      SUPABASE_URL: "http://127.0.0.1:57321",
      SUPABASE_SERVICE_ROLE_KEY: "   ",
    })).toThrow("requires runtime URL and service-role configuration");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("Payr repositories", () => {
  it("forwards explicit workspace and idempotency scope without losing bigint precision", async () => {
    const stub = createRpcStub({
      data: [{ outcome: "allocated", sequence_value: "9007199254740993" }],
      error: null,
    });

    await expect(createPayrRepositories(stub.client).allocateInvoiceSequence(allocationInput)).resolves.toEqual({
      outcome: "allocated",
      sequenceValue: 9_007_199_254_740_993n,
    });
    expect(stub.calls).toEqual([
      {
        name: "payr_allocate_invoice_sequence_v1",
        parameters: {
          p_workspace_id: WORKSPACE_ID,
          p_sequence_year: 2026,
          p_idempotency_key: "publish-1",
          p_request_fingerprint: "a".repeat(64),
        },
      },
    ]);
  });

  it("persists payment authorization facts with the exact frozen RPC mapping", async () => {
    const stub = createRpcStub({
      data: [{ outcome: "recorded", authorization_id: AUTHORIZATION_ID }],
      error: null,
    });

    await expect(createPayrRepositories(stub.client).recordPaymentAuthorization(authorizationInput)).resolves.toBe(
      AUTHORIZATION_ID,
    );
    expect(stub.calls).toEqual([
      {
        name: "payr_record_payment_authorization_v1",
        parameters: {
          p_workspace_id: WORKSPACE_ID,
          p_authorization_id: AUTHORIZATION_ID,
          p_invoice_id: "00000000-0000-4000-8000-000000000201",
          p_invoice_version_id: "00000000-0000-4000-8000-000000000301",
          p_invoice_key: `0x${"2".repeat(64)}`,
          p_chain_id: 5_042_002,
          p_contract_address: "0x1111111111111111111111111111111111111111",
          p_document_commitment: `0x${"4".repeat(64)}`,
          p_payee: "0x3333333333333333333333333333333333333333",
          p_amount_atomic: "1000000000000000000",
          p_attestor: "0x4444444444444444444444444444444444444444",
          p_typed_data_digest: `0x${"5".repeat(64)}`,
          p_signature_hash: `0x${"6".repeat(64)}`,
          p_signer_mode: "local-testnet",
          p_policy_result: "allowed",
          p_issued_at_second: 1_788_566_400,
          p_authorization_valid_until: 1_788_567_000,
        },
      },
    ]);
  });

  it("maps settlement facts and delivery JSON to the exact frozen RPC", async () => {
    const stub = createRpcStub({
      data: [
        {
          outcome: "recorded",
          settlement_id: SETTLEMENT_ID,
          receipt_document_id: RECEIPT_DOCUMENT_ID,
        },
      ],
      error: null,
    });

    await expect(createPayrRepositories(stub.client).recordSettlement(settlementInput)).resolves.toEqual({
      outcome: "recorded",
      settlementId: SETTLEMENT_ID,
      receiptDocumentId: RECEIPT_DOCUMENT_ID,
    });
    expect(stub.calls).toEqual([
      {
        name: "payr_record_settlement_v1",
        parameters: {
          p_workspace_id: WORKSPACE_ID,
          p_chain_id: 5_042_002,
          p_contract_address: "0x1111111111111111111111111111111111111111",
          p_invoice_key: `0x${"2".repeat(64)}`,
          p_transaction_hash: `0x${"3".repeat(64)}`,
          p_log_index: 0,
          p_block_number: "123",
          p_block_time: "2026-09-05T00:00:00.000Z",
          p_document_commitment: `0x${"4".repeat(64)}`,
          p_payer: "0x2222222222222222222222222222222222222222",
          p_payee: "0x3333333333333333333333333333333333333333",
          p_amount_atomic: "1000000000000000000",
          p_receipt_token_id: "00000000-0000-4000-8000-000000000020",
          p_receipt_key_version: 1,
          p_receipt_verifier_hash: "5".repeat(64),
          p_receipt_expires_at: "2026-10-05T00:00:00.000Z",
          p_deliveries: [
            {
              messageKind: "receipt",
              normalizedRecipient: "client@example.test",
              roles: ["client"],
            },
          ],
        },
      },
    ]);
  });

  it("reports idempotency and settlement conflicts without exposing prior private data", async () => {
    const privateValue = "prior-private-descriptor";
    const allocationStub = createRpcStub({
      data: [{ outcome: "conflict", sequence_value: null }],
      error: null,
    });
    const settlementStub = createRpcStub({
      data: null,
      error: { code: "P0001", message: `SETTLEMENT_CONFLICT ${privateValue}` },
    });

    const idempotencyError = await createPayrRepositories(allocationStub.client)
      .allocateInvoiceSequence(allocationInput)
      .catch((error: unknown) => error);
    const settlementError = await createPayrRepositories(settlementStub.client)
      .recordSettlement(settlementInput)
      .catch((error: unknown) => error);

    expect(idempotencyError).toMatchObject({ message: "IDEMPOTENCY_CONFLICT" });
    expect(settlementError).toMatchObject({ message: expect.stringContaining("SETTLEMENT_CONFLICT") });
    expect(String(idempotencyError)).not.toContain(privateValue);
    expect(String(settlementError)).not.toContain(privateValue);
  });

  it("rejects a missing workspace before every RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const repositories = createPayrRepositories({ rpc });
    const calls = [
      () =>
        repositories.allocateInvoiceSequence({
          ...allocationInput,
          workspaceId: undefined,
        } as unknown as AllocateInvoiceSequenceInput),
      () =>
        repositories.recordPaymentAuthorization({
          ...authorizationInput,
          workspaceId: "",
        }),
      () =>
        repositories.recordSettlement({
          ...settlementInput,
          workspaceId: "   ",
        }),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toThrow("requires workspaceId");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed, empty and multi-row RPC results for every method", async () => {
    for (const data of [null, {}, [], [null], [[]], ["recorded"], [{}], [{ outcome: "unused" }],
      [{ outcome: "unused" }, { outcome: "unused" }]]) {
      const repositories = createPayrRepositories(createRpcStub({ data, error: null }).client);
      for (const call of repositoryCalls) {
        await expect(call(repositories)).rejects.toThrow("returned an invalid result");
      }
    }
  });

  it("rejects malformed fields and unsafe numeric bigint values", async () => {
    const rowsByRpc: Readonly<Record<string, unknown>> = {
      payr_allocate_invoice_sequence_v1: [{ outcome: "allocated", sequence_value: Number.MAX_SAFE_INTEGER + 1 }],
      payr_record_payment_authorization_v1: [{ outcome: "recorded", authorization_id: null }],
      payr_record_settlement_v1: [
        { outcome: "recorded", settlement_id: SETTLEMENT_ID, receipt_document_id: null },
      ],
    };
    const client: RpcClient = {
      rpc(name) {
        return Promise.resolve({ data: rowsByRpc[name], error: null });
      },
    };
    const repositories = createPayrRepositories(client);

    for (const call of repositoryCalls) {
      await expect(call(repositories)).rejects.toThrow("returned an invalid result");
    }
  });

  it("sanitizes Supabase failures for every method", async () => {
    const privateValue = `service-role-key-${"x".repeat(80)}`;
    const client: RpcClient = {
      rpc() {
        return Promise.resolve({
          data: null,
          error: {
            code: "22023",
            message: `request body contained ${privateValue}`,
          },
        });
      },
    };
    const repositories = createPayrRepositories(client);

    for (const call of repositoryCalls) {
      const error = await call(repositories).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("22023");
      expect(String(error)).not.toContain(privateValue);
      expect(String(error)).not.toContain("request body");
    }
  });

  it.each([1, Number.MAX_SAFE_INTEGER, "9007199254740993", "9223372036854775807", 42n])(
    "decodes exact positive bigint sequence values and replays: %s", async (value) => {
      const repositories = createPayrRepositories(createRpcStub({
        data: [{ outcome: "replayed", sequence_value: value }], error: null,
      }).client);
      await expect(repositories.allocateInvoiceSequence(allocationInput)).resolves.toEqual({
        outcome: "replayed", sequenceValue: BigInt(value),
      });
    },
  );

  it.each([0, -1, 0n, -1n, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
    "9223372036854775808", 9223372036854775808n, "0", "-1", "01", "+1", "1e3", "1.0", " 1", "1\n", "", null, true])(
    "rejects invalid or lossy sequence values: %s", async (value) => {
      const repositories = createPayrRepositories(createRpcStub({
        data: [{ outcome: "allocated", sequence_value: value }], error: null,
      }).client);
      await expect(repositories.allocateInvoiceSequence(allocationInput)).rejects.toThrow("returned an invalid result");
    },
  );

  it("requires exact result columns, UUIDs and a null conflict value", async () => {
    for (const [call, rows] of [
      [repositoryCalls[0], [
        { outcome: "allocated", sequence_value: 1, private_descriptor: "private" },
        { outcome: "conflict", sequence_value: 1 },
        { outcome: "conflict" },
      ]],
      [repositoryCalls[1], [
        { outcome: "recorded", authorization_id: "not-a-uuid" },
        { outcome: "recorded", authorization_id: AUTHORIZATION_ID, extra: true },
        { outcome: "recorded", authorization_id: RECEIPT_DOCUMENT_ID },
        { outcome: "replayed", authorization_id: AUTHORIZATION_ID },
      ]],
      [repositoryCalls[2], [
        { outcome: "recorded", settlement_id: " ", receipt_document_id: RECEIPT_DOCUMENT_ID },
        { outcome: "recorded", settlement_id: SETTLEMENT_ID, receipt_document_id: "private-value" },
        { outcome: "recorded", settlement_id: SETTLEMENT_ID, receipt_document_id: RECEIPT_DOCUMENT_ID, extra: true },
      ]],
    ] as const) {
      for (const row of rows) {
        const repositories = createPayrRepositories(createRpcStub({ data: [row], error: null }).client);
        await expect(call(repositories)).rejects.toThrow("returned an invalid result");
      }
    }
  });

  it("decodes settlement replays without accepting unknown outcomes", async () => {
    const repositories = createPayrRepositories(createRpcStub({
      data: [{ outcome: "replayed", settlement_id: SETTLEMENT_ID, receipt_document_id: RECEIPT_DOCUMENT_ID }],
      error: null,
    }).client);
    await expect(repositories.recordSettlement(settlementInput)).resolves.toEqual({
      outcome: "replayed", settlementId: SETTLEMENT_ID, receiptDocumentId: RECEIPT_DOCUMENT_ID,
    });
  });

  it("rejects unsafe number inputs before they can be persisted as rounded bigint facts", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const repositories = createPayrRepositories({ rpc });
    for (const value of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5]) {
      for (const field of ["chainId", "issuedAtSecond", "authorizationValidUntil"] as const) {
        await expect(repositories.recordPaymentAuthorization({ ...authorizationInput, [field]: value }))
          .rejects.toThrow("requires a safe integer");
      }
      await expect(repositories.recordSettlement({ ...settlementInput, chainId: value }))
        .rejects.toThrow("requires a safe integer");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("strips unrecognized error codes, messages and transport exceptions", async () => {
    for (const client of [
      createRpcStub({ data: null, error: { code: "private_secret", message: "private_secret" } }).client,
      { rpc() { throw new Error("private_secret"); } },
      { rpc() { return Promise.reject(new Error("private_secret")); } },
    ]) {
      const repositories = createPayrRepositories(client);
      for (const call of repositoryCalls) {
        const error = await call(repositories).catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toMatch(/failed$/);
        expect(error).not.toHaveProperty("cause");
      }
    }
  });

  it("requires an explicit error-free RPC envelope and gives errors precedence over success data", async () => {
    const rows = [
      { outcome: "allocated", sequence_value: 1 },
      { outcome: "recorded", authorization_id: AUTHORIZATION_ID },
      { outcome: "recorded", settlement_id: SETTLEMENT_ID, receipt_document_id: RECEIPT_DOCUMENT_ID },
    ];
    for (const [index, call] of repositoryCalls.entries()) {
      for (const error of [undefined, false, {}, { code: "PGRST202", message: "private-value" }]) {
        const repositories = createPayrRepositories(createRpcStub({ data: [rows[index]], error } as RpcResult).client);
        const failure = await call(repositories).catch((reason: unknown) => reason);
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toContain("failed");
        expect(String(failure)).not.toContain("private-value");
        if (typeof error === "object" && "code" in error) expect(String(failure)).toContain("PGRST202");
      }
    }
  });

  it.each([
    "AUTHORIZATION_NOT_PAYABLE", "AUTHORIZATION_FACTS_MISMATCH", "AUTHORIZATION_ALREADY_SETTLED",
    "AUTHORIZATION_DEADLINE_INVALID", "SETTLEMENT_CONFLICT", "SETTLEMENT_FACTS_MISMATCH",
    "SETTLEMENT_DELIVERIES_INVALID", "SETTLEMENT_RECEIPT_METADATA_INVALID",
  ])("retains only the safe database denial marker %s", async (marker) => {
    const repositories = createPayrRepositories(createRpcStub({
      data: null, error: { code: "P0001", message: marker },
    }).client);
    for (const call of repositoryCalls) {
      await expect(call(repositories)).rejects.toThrow(`failed (P0001, ${marker})`);
    }
  });
});

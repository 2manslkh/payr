import { describe, expect, it } from "vitest";

import { createPayrRepositories, type RpcClient } from "./repositories";

describe("Payr repositories", () => {
  it("forwards explicit workspace and idempotency scope to sequence allocation", async () => {
    const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
    const client: RpcClient = {
      rpc(name, parameters) {
        calls.push({ name, parameters });
        return Promise.resolve({
          data: [{ outcome: "allocated", sequence_value: 42 }],
          error: null,
        });
      },
    };

    const repositories = createPayrRepositories(client);
    await expect(
      repositories.allocateInvoiceSequence({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        sequenceYear: 2026,
        idempotencyKey: "publish-1",
        requestFingerprint: "a".repeat(64),
      }),
    ).resolves.toEqual({ outcome: "allocated", sequenceValue: 42n });
    expect(calls).toEqual([
      {
        name: "payr_allocate_invoice_sequence_v1",
        parameters: {
          p_workspace_id: "00000000-0000-4000-8000-000000000001",
          p_sequence_year: 2026,
          p_idempotency_key: "publish-1",
          p_request_fingerprint: "a".repeat(64),
        },
      },
    ]);
  });

  it("never drops workspace scope from settlement writes", async () => {
    const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
    const client: RpcClient = {
      rpc(name, parameters) {
        calls.push({ name, parameters });
        return Promise.resolve({
          data: [
            {
              outcome: "recorded",
              settlement_id: "00000000-0000-4000-8000-000000000010",
              receipt_document_id: "00000000-0000-4000-8000-000000000011",
            },
          ],
          error: null,
        });
      },
    };
    const repositories = createPayrRepositories(client);

    await repositories.recordSettlement({
      workspaceId: "00000000-0000-4000-8000-000000000001",
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
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("payr_record_settlement_v1");
    expect(calls[0]?.parameters.p_workspace_id).toBe("00000000-0000-4000-8000-000000000001");
  });
});

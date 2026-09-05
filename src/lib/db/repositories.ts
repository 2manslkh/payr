export const R02_RPC_NAMES = {
  allocateInvoiceSequence: "payr_allocate_invoice_sequence_v1",
  recordPaymentAuthorization: "payr_record_payment_authorization_v1",
  recordSettlement: "payr_record_settlement_v1",
} as const;

export type SafeResultDescriptor = Readonly<{
  ids?: Readonly<Record<string, string>>;
  hashes?: Readonly<Record<string, string>>;
  filenames?: Readonly<Record<string, string>>;
  state?: string;
}>;

export type AllocateInvoiceSequenceInput = Readonly<{
  workspaceId: string;
  sequenceYear: number;
  idempotencyKey: string;
  requestFingerprint: string;
}>;

export type AllocateInvoiceSequenceResult = Readonly<{
  outcome: "allocated" | "replayed";
  sequenceValue: bigint;
}>;

export type RecordPaymentAuthorizationInput = Readonly<{
  workspaceId: string;
  authorizationId: string;
  invoiceId: string;
  invoiceVersionId: string;
  invoiceKey: `0x${string}`;
  chainId: number;
  contractAddress: `0x${string}`;
  documentCommitment: `0x${string}`;
  payee: `0x${string}`;
  amountAtomic: string;
  attestor: `0x${string}`;
  typedDataDigest: `0x${string}`;
  signatureHash: `0x${string}`;
  signerMode: string;
  policyResult: string;
  issuedAtSecond: number;
  authorizationValidUntil: number;
}>;

export type SettlementDeliveryInput = Readonly<{
  messageKind: "receipt";
  normalizedRecipient: string;
  roles: Array<"issuer" | "client">;
}>;

export type RecordSettlementInput = Readonly<{
  workspaceId: string;
  chainId: number;
  contractAddress: `0x${string}`;
  invoiceKey: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: string;
  blockTime: string;
  documentCommitment: `0x${string}`;
  payer: `0x${string}`;
  payee: `0x${string}`;
  amountAtomic: string;
  receiptTokenId: string;
  receiptKeyVersion: number;
  receiptVerifierHash: string;
  receiptExpiresAt: string;
  deliveries: SettlementDeliveryInput[];
}>;

export type RecordSettlementResult = Readonly<{
  outcome: "recorded" | "replayed";
  settlementId: string;
  receiptDocumentId: string;
}>;

export type PayrRepositories = Readonly<{
  allocateInvoiceSequence(input: AllocateInvoiceSequenceInput): Promise<AllocateInvoiceSequenceResult>;
  recordPaymentAuthorization(input: RecordPaymentAuthorizationInput): Promise<string>;
  recordSettlement(input: RecordSettlementInput): Promise<RecordSettlementResult>;
}>;

export type RpcResult = Readonly<{
  data: unknown;
  error: { code?: string; message: string; details?: string } | null;
}>;

export type RpcClient = Readonly<{
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
}>;

const SAFE_RPC_ERROR_MARKERS = [
  "AUTHORIZATION_NOT_PAYABLE",
  "AUTHORIZATION_FACTS_MISMATCH",
  "AUTHORIZATION_ALREADY_SETTLED",
  "AUTHORIZATION_DEADLINE_INVALID",
  "SETTLEMENT_CONFLICT",
  "SETTLEMENT_FACTS_MISMATCH",
  "SETTLEMENT_DELIVERIES_INVALID",
  "SETTLEMENT_RECEIPT_METADATA_INVALID",
] as const;

function requireWorkspaceId(workspaceId: unknown, operation: string): string {
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
    throw new Error(`${operation} requires workspaceId`);
  }

  return workspaceId;
}

function requireSafeInteger(value: number, operation: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${operation} requires a safe integer`);
  }
  return value;
}

function decodeSingleRow(data: unknown, operation: string, columns: string[]): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${operation} returned an invalid result`);
  }

  const row: unknown = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)
    || Object.keys(row).length !== columns.length
    || !columns.every((column) => Object.hasOwn(row, column))) {
    throw new Error(`${operation} returned an invalid result`);
  }

  return row as Record<string, unknown>;
}

function decodeBigInt(value: unknown, operation: string): bigint {
  let decoded: bigint;
  if (typeof value === "bigint") {
    decoded = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    decoded = BigInt(value);
  } else if (typeof value === "string" && value.trim() === value && /^[1-9][0-9]{0,18}$/.test(value)) {
    decoded = BigInt(value);
  } else {
    throw new Error(`${operation} returned an invalid result`);
  }

  // PostgREST may send bigint as a JSON number; rounded numbers must never be accepted.
  if (decoded <= 0n || decoded > 9_223_372_036_854_775_807n) {
    throw new Error(`${operation} returned an invalid result`);
  }
  return decoded;
}

function decodeUuid(value: unknown, operation: string): string {
  if (typeof value !== "string" || value.length !== 36
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error(`${operation} returned an invalid result`);
  }

  return value;
}

function rpcFailure(operation: string, error: NonNullable<RpcResult["error"]>): Error {
  const safeCode = typeof error.code === "string" && error.code.trim() === error.code
    && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(error.code) ? error.code : null;
  const safeMarker = SAFE_RPC_ERROR_MARKERS.find((marker) =>
    typeof error.message === "string" && (error.message === marker || error.message.startsWith(`${marker} `)));
  const details = [safeCode, safeMarker].filter((detail): detail is string => detail !== null && detail !== undefined);

  return new Error(`${operation} failed${details.length > 0 ? ` (${details.join(", ")})` : ""}`);
}

async function callRpc(
  client: RpcClient,
  operation: keyof typeof R02_RPC_NAMES,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  let result: RpcResult;
  try {
    result = await client.rpc(R02_RPC_NAMES[operation], parameters);
  } catch {
    // Transport exceptions may contain request URLs, credentials or private payloads.
    throw new Error(`${operation} failed`);
  }
  if (!result || result.error !== null) {
    if (result?.error && typeof result.error === "object") {
      throw rpcFailure(operation, result.error);
    }
    throw new Error(`${operation} failed`);
  }
  return result.data;
}

export function createPayrRepositories(client: RpcClient): PayrRepositories {
  return {
    async allocateInvoiceSequence(input) {
      const operation = "allocateInvoiceSequence";
      const data = await callRpc(client, operation, {
        p_workspace_id: requireWorkspaceId(input.workspaceId, operation),
        p_sequence_year: requireSafeInteger(input.sequenceYear, operation),
        p_idempotency_key: input.idempotencyKey,
        p_request_fingerprint: input.requestFingerprint,
      });

      const row = decodeSingleRow(data, operation, ["outcome", "sequence_value"]);
      if (row.outcome === "conflict" && row.sequence_value === null) {
        throw new Error("IDEMPOTENCY_CONFLICT");
      }
      if (row.outcome !== "allocated" && row.outcome !== "replayed") {
        throw new Error(`${operation} returned an invalid result`);
      }

      return {
        outcome: row.outcome,
        sequenceValue: decodeBigInt(row.sequence_value, operation),
      };
    },
    async recordPaymentAuthorization(input) {
      const operation = "recordPaymentAuthorization";
      const data = await callRpc(client, operation, {
        p_workspace_id: requireWorkspaceId(input.workspaceId, operation),
        p_authorization_id: input.authorizationId,
        p_invoice_id: input.invoiceId,
        p_invoice_version_id: input.invoiceVersionId,
        p_invoice_key: input.invoiceKey,
        p_chain_id: requireSafeInteger(input.chainId, operation),
        p_contract_address: input.contractAddress,
        p_document_commitment: input.documentCommitment,
        p_payee: input.payee,
        p_amount_atomic: input.amountAtomic,
        p_attestor: input.attestor,
        p_typed_data_digest: input.typedDataDigest,
        p_signature_hash: input.signatureHash,
        p_signer_mode: input.signerMode,
        p_policy_result: input.policyResult,
        p_issued_at_second: requireSafeInteger(input.issuedAtSecond, operation),
        p_authorization_valid_until: requireSafeInteger(input.authorizationValidUntil, operation),
      });

      const row = decodeSingleRow(data, operation, ["outcome", "authorization_id"]);
      if (row.outcome !== "recorded" || row.authorization_id !== input.authorizationId) {
        throw new Error(`${operation} returned an invalid result`);
      }

      return decodeUuid(row.authorization_id, operation);
    },
    async recordSettlement(input) {
      const operation = "recordSettlement";
      const data = await callRpc(client, operation, {
        p_workspace_id: requireWorkspaceId(input.workspaceId, operation),
        p_chain_id: requireSafeInteger(input.chainId, operation),
        p_contract_address: input.contractAddress,
        p_invoice_key: input.invoiceKey,
        p_transaction_hash: input.transactionHash,
        p_log_index: requireSafeInteger(input.logIndex, operation),
        p_block_number: input.blockNumber,
        p_block_time: input.blockTime,
        p_document_commitment: input.documentCommitment,
        p_payer: input.payer,
        p_payee: input.payee,
        p_amount_atomic: input.amountAtomic,
        p_receipt_token_id: input.receiptTokenId,
        p_receipt_key_version: requireSafeInteger(input.receiptKeyVersion, operation),
        p_receipt_verifier_hash: input.receiptVerifierHash,
        p_receipt_expires_at: input.receiptExpiresAt,
        p_deliveries: input.deliveries.map((delivery) => ({
          messageKind: delivery.messageKind,
          normalizedRecipient: delivery.normalizedRecipient,
          roles: [...delivery.roles],
        })),
      });

      const row = decodeSingleRow(data, operation, ["outcome", "settlement_id", "receipt_document_id"]);
      if (row.outcome !== "recorded" && row.outcome !== "replayed") {
        throw new Error(`${operation} returned an invalid result`);
      }

      return {
        outcome: row.outcome,
        settlementId: decodeUuid(row.settlement_id, operation),
        receiptDocumentId: decodeUuid(row.receipt_document_id, operation),
      };
    },
  };
}

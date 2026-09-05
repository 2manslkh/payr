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
  error: { code?: string; message: string } | null;
}>;

export type RpcClient = Readonly<{
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
}>;

export function createPayrRepositories(_client: RpcClient): PayrRepositories {
  throw new Error("F1 implementation pending");
}

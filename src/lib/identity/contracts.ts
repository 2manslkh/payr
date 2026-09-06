import { z } from "zod";
import { isCountryCode } from "../domain/country";

export const CONNECTOR_SCOPES = ["invoice:draft", "invoice:publish", "invoice:status", "invoice:void"] as const;
export const SESSION_COOKIE = "__Host-payr-session";
export const NONCE_LIFETIME_SECONDS = 300;
export const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

export const walletSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value.toLowerCase());
export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(32),
  countryCode: z.string().refine(isCountryCode, "Use an assigned ISO alpha-2 country code"),
}).strict();
export type BillingAddress = z.infer<typeof addressSchema>;

const contactEmail = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
export const saveSenderSchema = z.object({
  expectedRevision: z.number().int().positive(),
  businessName: z.string().trim().min(1).max(200),
  billingAddress: addressSchema,
  contactName: z.string().trim().min(1).max(200),
  contactEmail,
  invoicePrefix: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}$/),
  defaultPaymentTermsDays: z.number().int().min(0).max(365),
}).strict();
export type SaveSenderInput = z.infer<typeof saveSenderSchema>;

export const saveClientSchema = z.object({
  id: z.string().uuid().nullable(),
  expectedRevision: z.number().int().positive().nullable(),
  alias: z.string().trim().min(1).max(100),
  businessName: z.string().trim().min(1).max(200),
  billingAddress: addressSchema,
  contactName: z.string().trim().min(1).max(200),
  contactEmail,
}).strict().refine((value) => (value.id === null) === (value.expectedRevision === null), {
  message: "Client updates require both id and expectedRevision",
});
export type SaveClientInput = z.infer<typeof saveClientSchema>;

export const savedClientProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user_provided"), confirmed: z.literal(true) }).strict(),
  z.object({
    kind: z.literal("web_source"), confirmed: z.literal(true),
    url: z.string().url().max(65536).refine((value) => {
      try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/[\s\\]/.test(value); }
      catch { return false; }
    }),
  }).strict(),
]);
export type SavedClientProvenance = z.infer<typeof savedClientProvenanceSchema>;

export const nonceRequestSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("payr-login-v1"), wallet: walletSchema }).strict(),
  z.object({
    purpose: z.literal("payr-payout-change-v1"),
    newPayoutWallet: walletSchema,
    expectedRevision: z.number().int().positive(),
  }).strict(),
]);
export type NonceRequest = z.infer<typeof nonceRequestSchema>;
export const verifyRequestSchema = z.object({
  nonceId: z.string().uuid(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
export const createConnectorSchema = z.object({ expiresInDays: z.number().int().min(1).max(30) }).strict();

export type IdentitySession = Readonly<{ workspaceId: string; ownerWallet: string }>;
export type IdentityConfig = Readonly<{
  appOrigin: string;
  chainId: number;
  sessionKey: Uint8Array;
  connectorPepper: Uint8Array;
}>;
export type AuthNonce = Readonly<{
  id: string;
  workspaceId: string | null;
  wallet: string;
  purpose: "payr-login-v1" | "payr-payout-change-v1";
  challenge: string;
  domain: string;
  uri: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  payoutFrom: string | null;
  payoutTo: string | null;
  profileRevision: number | null;
}>;
export type NonceResponse = Readonly<{ nonceId: string; message: string; expiresAt: string }>;
export type SenderProfile = Readonly<{
  id: string;
  revision: number;
  businessName: string | null;
  billingAddress: BillingAddress | null;
  contactName: string | null;
  contactEmail: string | null;
  payoutWallet: string;
  invoicePrefix: string | null;
  defaultPaymentTermsDays: number | null;
}>;
export type ClientProfile = Readonly<Omit<SaveClientInput, "id" | "expectedRevision"> & {
  id: string;
  revision: number;
  provenance: Record<string, SavedClientProvenance>;
}>;
export type ConnectorMetadata = Readonly<{
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  scopes: typeof CONNECTOR_SCOPES;
}>;
export type ConnectorRecord = ConnectorMetadata & Readonly<{ workspaceId: string; tokenHash: string }>;
export type AuditEvent = Readonly<{
  id: string;
  tokenId: string | null;
  action: string;
  outcome: string;
  createdAt: string;
}>;
export type ConnectorAdmission =
  | Readonly<{ outcome: "allowed"; workspaceId: string; tokenId: string }>
  | Readonly<{ outcome: "denied" }>
  | Readonly<{ outcome: "rate_limited"; retryAfterSeconds: number }>;

export type IdentityRepository = Readonly<{
  admitNonceIssuance(input: { walletHash: string; ipHash: string }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  issueNonce(nonce: AuthNonce): Promise<AuthNonce>;
  findNonce(id: string): Promise<AuthNonce | null>;
  completeLogin(nonceId: string, verifiedWallet: string): Promise<IdentitySession>;
  applyPayoutChange(identity: IdentitySession, nonceId: string): Promise<SenderProfile>;
  getProfile(identity: IdentitySession): Promise<SenderProfile>;
  saveProfile(identity: IdentitySession, input: SaveSenderInput): Promise<SenderProfile>;
  listClients(identity: IdentitySession): Promise<ClientProfile[]>;
  saveClient(identity: IdentitySession, input: SaveClientInput): Promise<ClientProfile>;
  listConnectors(identity: IdentitySession): Promise<ConnectorMetadata[]>;
  createConnector(identity: IdentitySession, input: { id: string; tokenHash: string; expiresAt: string }): Promise<ConnectorMetadata>;
  revokeConnector(identity: IdentitySession, id: string): Promise<ConnectorMetadata>;
  findConnector(id: string): Promise<ConnectorRecord | null>;
  admitConnector(input: { id: string; tokenHash: string; ipHash: string; action: string }): Promise<ConnectorAdmission>;
  listActivity(identity: IdentitySession): Promise<AuditEvent[]>;
}>;

export class IdentityError extends Error {
  constructor(public readonly code: string, public readonly status = 400, public readonly retryAfterSeconds?: number) {
    super(code);
    this.name = "IdentityError";
  }
}

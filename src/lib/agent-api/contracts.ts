import { z } from "zod";
import { saveConnectorSenderSchema, walletSchema, type ConnectorMetadata, type ConnectorScope } from "../identity/contracts";
import { draftInputSchema } from "../invoices/schemas";
import { publishInvoiceSchema } from "../invoices/publication";
import { COMMERCIAL_STATES } from "../domain/invoice";

export const ACCOUNT_SCOPES = ["invoice:draft", "invoice:publish", "invoice:status", "sender:read", "sender:write"] as const;
export const accountScopesSchema = z.array(z.enum(ACCOUNT_SCOPES)).min(1).max(5)
  .refine((scopes) => scopes.includes("invoice:status") && new Set(scopes).size === scopes.length);
export const operationNames = ["create_account_challenge", "register_account", "get_account", "revoke_current_credential",
  "get_sender_profile", "save_sender_profile", "create_invoice_draft", "list_invoices", "get_invoice", "publish_invoice", "get_invoice_status"] as const;
export type AgentOperation = typeof operationNames[number];
const empty = z.object({}).strict();
const invoiceId = z.object({ invoiceId: z.string().uuid().transform((value) => value.toLowerCase()) }).strict();

export const operationSchemas = {
  create_account_challenge: z.object({ wallet: walletSchema,
    scopes: accountScopesSchema.default([...ACCOUNT_SCOPES]), expiresInDays: z.number().int().min(1).max(7).default(1) }).strict(),
  register_account: z.object({ challengeId: z.string().uuid().transform((value) => value.toLowerCase()), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict(),
  get_account: empty,
  revoke_current_credential: z.object({ approval: z.literal(true) }).strict(),
  get_sender_profile: empty,
  save_sender_profile: saveConnectorSenderSchema,
  create_invoice_draft: draftInputSchema,
  list_invoices: z.object({ search: z.string().trim().max(200).regex(/^[^\u0000-\u001f\u007f]*$/).default(""),
    state: z.enum(COMMERCIAL_STATES).optional(), offset: z.number().int().min(0).max(10_000).default(0) }).strict(),
  get_invoice: invoiceId,
  publish_invoice: publishInvoiceSchema,
  get_invoice_status: invoiceId,
};

export const operationScopes: Record<AgentOperation, ConnectorScope | null> = {
  create_account_challenge: null, register_account: null, get_account: "invoice:status",
  revoke_current_credential: "invoice:status", get_sender_profile: "sender:read", save_sender_profile: "sender:write",
  create_invoice_draft: "invoice:draft", list_invoices: "invoice:status", get_invoice: "invoice:status",
  publish_invoice: "invoice:publish", get_invoice_status: "invoice:status",
};

export type RegistrationChallenge = {
  id: string; serviceId: string; wallet: string; challenge: string; domain: string; uri: string; chainId: number;
  issuedAt: string; expiresAt: string; consumedAt: string | null; scopes: readonly ConnectorScope[]; expiresInDays: number;
};
export type AgentAccount = {
  workspaceId: string; ownerWallet: string; credential: ConnectorMetadata; senderSetupRequired: boolean;
};
export type GatewayRepository = {
  admitService(input: { id: string; tokenHash: string; operation: AgentOperation; ipHash: string }): Promise<{ serviceId: string }>;
  issueChallenge(input: { challenge: RegistrationChallenge; walletHash: string; ipHash: string }): Promise<void>;
  findChallenge(input: { id: string; serviceId: string }): Promise<RegistrationChallenge | null>;
  completeRegistration(input: { challengeId: string; serviceId: string; verifiedWallet: string; connectorId: string; tokenHash: string }): Promise<AgentAccount>;
  admitAccount(input: { serviceId: string; id: string; tokenHash: string; action: ConnectorScope; ipHash: string }): Promise<AgentAccount>;
  revokeAccount(input: { serviceId: string; id: string; tokenHash: string }): Promise<{ credentialId: string; revoked: true }>;
};

export type AgentRequestContext = { serviceId: string; account?: AgentAccount; accountCredential?: string };
export type AgentRuntime = {
  appOrigin: string;
  authenticateService(token: string, operation: AgentOperation, ip: string): Promise<{ serviceId: string }>;
  authenticateAccount(token: string, serviceId: string, action: ConnectorScope, ip: string): Promise<AgentAccount>;
  execute(operation: AgentOperation, input: unknown, context: AgentRequestContext, ip: string): Promise<unknown>;
};

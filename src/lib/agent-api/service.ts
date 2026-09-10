import { randomBytes, randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { z } from "zod";
import { IdentityError, type IdentityConfig } from "../identity/contracts";
import type { DraftRepository } from "../invoices/contracts";
import type { McpServices } from "../mcp/server";
import { normalizeIp } from "../security/ip";
import { accountScopesSchema, operationSchemas, operationScopes, type AgentRuntime, type GatewayRepository, type RegistrationChallenge } from "./contracts";
import { accountCredentialHash, agentCredentialId, gatewayHash, mintAgentCredential, serviceCredentialHash } from "./credentials";

const storedChallenge = z.object({
  id: z.string().uuid(), serviceId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), wallet: z.string().regex(/^0x[0-9a-f]{40}$/),
  challenge: z.string().length(43).regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  domain: z.string(), uri: z.string(), chainId: z.number().int().positive(),
  issuedAt: z.iso.datetime({ precision: 3 }), expiresAt: z.iso.datetime({ precision: 3 }), consumedAt: z.null(),
  scopes: accountScopesSchema, expiresInDays: z.number().int().min(1).max(7),
}).strict();

export function registrationMessage(challenge: RegistrationChallenge) {
  return [
    "Payr agent account registration", "Purpose: payr-agent-registration-v1",
    `Wallet: ${challenge.wallet}`, `Service: ${challenge.serviceId}`, `Domain: ${challenge.domain}`, `URI: ${challenge.uri}`,
    `Chain ID: ${challenge.chainId}`, `Challenge ID: ${challenge.id}`, `Nonce: ${challenge.challenge}`,
    `Issued At: ${challenge.issuedAt}`, `Expiration Time: ${challenge.expiresAt}`,
    `Credential Scopes: ${challenge.scopes.join(",")}`, `Credential Lifetime Days: ${challenge.expiresInDays}`,
    "Authorize Payr to create or retrieve my wallet-owned workspace and issue the scoped credential above.",
    "For a new workspace, this wallet is the initial payout address. Existing payout settings are unchanged.",
    "This signature does not authorize a payment, payout change, or invoice publication.",
  ].join("\n");
}

export function createAgentApi(dependencies: {
  config: IdentityConfig; repository: GatewayRepository; services: Omit<McpServices, "void">;
  drafts: Pick<DraftRepository, "listInvoices" | "getInvoiceDetail">;
}, now: () => Date = () => new Date()): AgentRuntime {
  const { config, repository, services, drafts } = dependencies;
  const ipHash = (ip: string) => {
    const normalized = normalizeIp(ip);
    if (!normalized) throw new IdentityError("AUTH_REQUIRED", 401);
    return gatewayHash(config.connectorPepper, "ip", normalized);
  };
  return {
    appOrigin: config.appOrigin,
    authenticateService: (token, operation, ip) => repository.admitService({ id: agentCredentialId(token, "service"),
      tokenHash: serviceCredentialHash(token), operation, ipHash: ipHash(ip) }),
    authenticateAccount: (token, serviceId, action, ip) => repository.admitAccount({ id: agentCredentialId(token, "account"), serviceId,
      tokenHash: accountCredentialHash(config.connectorPepper, token), action, ipHash: ipHash(ip) }),
    async execute(operation, input, context, ip) {
      if (operation === "create_account_challenge") {
        const parsed = operationSchemas.create_account_challenge.parse(input);
        const issuedAt = now();
        const challenge: RegistrationChallenge = {
          id: randomUUID(), serviceId: context.serviceId, wallet: parsed.wallet, challenge: randomBytes(32).toString("base64url"),
          domain: new URL(config.appOrigin).host, uri: config.appOrigin, chainId: config.chainId,
          issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + 300_000).toISOString(), consumedAt: null,
          scopes: parsed.scopes, expiresInDays: parsed.expiresInDays,
        };
        await repository.issueChallenge({ challenge, ipHash: ipHash(ip), walletHash: gatewayHash(config.connectorPepper, "wallet", parsed.wallet) });
        return { challengeId: challenge.id, message: registrationMessage(challenge), expiresAt: challenge.expiresAt,
          scopes: challenge.scopes, expiresInDays: challenge.expiresInDays };
      }
      if (operation === "register_account") {
        const parsed = operationSchemas.register_account.parse(input);
        const challenge = await repository.findChallenge({ id: parsed.challengeId, serviceId: context.serviceId });
        const time = now().getTime();
        if (!challenge || !storedChallenge.safeParse(challenge).success || challenge.id !== parsed.challengeId
          || challenge.serviceId !== context.serviceId || challenge.uri !== config.appOrigin
          || challenge.domain !== new URL(config.appOrigin).host || challenge.chainId !== config.chainId
          || !Number.isFinite(time) || Date.parse(challenge.issuedAt) > time || Date.parse(challenge.expiresAt) <= time
          || Date.parse(challenge.expiresAt) <= Date.parse(challenge.issuedAt)
          || Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt) > 300_000) {
          throw new IdentityError("NONCE_INVALID_OR_USED", 400);
        }
        let valid = false;
        try {
          valid = await verifyMessage({ address: challenge.wallet as `0x${string}`, message: registrationMessage(challenge), signature: parsed.signature as `0x${string}` });
        } catch { /* Invalid EOA signatures must never surface provider/recovery details. */ }
        if (!valid) throw new IdentityError("SIGNATURE_INVALID", 401);
        const { id, token } = mintAgentCredential("account");
        const account = await repository.completeRegistration({ challengeId: challenge.id, serviceId: context.serviceId,
          verifiedWallet: challenge.wallet, connectorId: id, tokenHash: accountCredentialHash(config.connectorPepper, token) });
        return { account, accountCredential: token };
      }
      const { account, accountCredential } = context;
      if (!account || !accountCredential || account.credential.id !== agentCredentialId(accountCredential, "account")
        || account.credential.revokedAt !== null || Date.parse(account.credential.expiresAt) <= now().getTime()
        || !account.credential.scopes.includes(operationScopes[operation]!)) throw new IdentityError("AUTH_REQUIRED", 401);
      const actor = { workspaceId: account.workspaceId, ownerWallet: null, connectorId: account.credential.id };
      switch (operation) {
        case "get_account_context":
          if (!services.getAccountContext) throw new IdentityError("CONFIGURATION_ERROR", 503);
          return services.getAccountContext(actor, operationSchemas.get_account_context.parse(input));
        case "get_account":
          operationSchemas.get_account.parse(input);
          return account;
        case "revoke_current_credential":
          operationSchemas.revoke_current_credential.parse(input);
          return repository.revokeAccount({ id: account.credential.id, serviceId: context.serviceId,
            tokenHash: accountCredentialHash(config.connectorPepper, accountCredential) });
        case "get_sender_profile": return services.getSenderProfile(actor, input);
        case "save_sender_profile": return services.saveSenderProfile(actor, input);
        case "create_invoice_draft": return services.createDraft(actor, input);
        case "publish_invoice": return services.publish(actor, input);
        case "get_invoice_status": return services.status(actor, operationSchemas.get_invoice_status.parse(input).invoiceId);
        case "get_invoice": {
          const result = await drafts.getInvoiceDetail(actor, operationSchemas.get_invoice.parse(input).invoiceId);
          if (!result) throw new IdentityError("NOT_FOUND", 404);
          return result;
        }
        case "list_invoices": {
          const query = operationSchemas.list_invoices.parse(input);
          return drafts.listInvoices(actor, { search: query.search, commercialState: query.state ?? null, offset: query.offset, limit: 50 });
        }
      }
    },
  };
}

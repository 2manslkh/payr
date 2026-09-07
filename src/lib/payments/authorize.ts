import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { hashTypedData, keccak256, recoverTypedDataAddress, type Address } from "viem";
import type { PayrRepositories } from "../db/repositories";
import type { InvoiceAccessTarget } from "../documents/contracts";
import { authorizationWindow, paymentTypedData } from "../domain/payment-authorization";
import type { PaymentSigner } from "../chain/signer";

export class AuthorizationError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

export function createAuthorizationService(dependencies: {
  access: { resolve(slug: string, ip?: string): Promise<InvoiceAccessTarget | null> };
  repository: Pick<PayrRepositories, "recordPaymentAuthorization">;
  signer: PaymentSigner; now?: () => number;
}) {
  return {
    async authorize(slug: string, ip: string) {
      try {
        const target = await dependencies.access.resolve(slug, ip);
        if (!target) throw new AuthorizationError("INVOICE_UNAVAILABLE", 404);
        if (target.commercialState !== "published" || target.voidedAt !== null || target.settlement !== null
          || !target.attempt.artifact || target.attempt.state !== "finalized") throw new AuthorizationError("AUTHORIZATION_NOT_PAYABLE", 409);
        const attempt = structuredClone(target.attempt);
        const payableUntil = Date.parse(attempt.snapshot.payableUntil) / 1000;
        let window;
        try { window = authorizationWindow((dependencies.now ?? Date.now)(), payableUntil); }
        catch { throw new AuthorizationError("AUTHORIZATION_NOT_PAYABLE", 409); }
        const typedData = paymentTypedData(attempt.chainId, attempt.contractAddress, {
          invoiceKey: attempt.invoiceKey, documentCommitment: attempt.artifact!.documentCommitment,
          payee: attempt.snapshot.sender.payoutWallet as Address, amount: BigInt(attempt.snapshot.amountAtomic),
          authorizationValidUntil: BigInt(window.authorizationValidUntil), payableUntil: BigInt(payableUntil),
        });
        const signer = dependencies.signer;
        const signature = await signer.sign(structuredClone(typedData));
        const recovered = await recoverTypedDataAddress({ ...typedData, signature });
        if (recovered.toLowerCase() !== signer.attestor.toLowerCase()) throw new Error("Invalid signer");
        const current = await dependencies.access.resolve(slug);
        if (!current || current.commercialState !== "published" || current.settlement !== null
          || current.voidedAt !== null || !isDeepStrictEqual(current.attempt, attempt)) throw new AuthorizationError("AUTHORIZATION_NOT_PAYABLE", 409);
        const authorizationId = randomUUID();
        const recorded = await dependencies.repository.recordPaymentAuthorization({
          authorizationId, workspaceId: attempt.workspaceId, invoiceId: attempt.invoiceId, invoiceVersionId: attempt.invoiceVersionId,
          invoiceKey: attempt.invoiceKey, chainId: attempt.chainId, contractAddress: attempt.contractAddress,
          documentCommitment: typedData.message.documentCommitment, payee: typedData.message.payee,
          amountAtomic: typedData.message.amount.toString(), attestor: signer.attestor.toLowerCase() as Address,
          typedDataDigest: hashTypedData(typedData), signatureHash: keccak256(signature), signerMode: signer.mode,
          policyResult: "allowed:testnet-only", ...window,
        });
        if (recorded !== authorizationId) throw new Error("Authorization persistence mismatch");
        return {
          schemaVersion: "payr.payment-authorization.v1" as const, authorizationId,
          domain: { ...typedData.domain, chainId: attempt.chainId }, types: typedData.types, primaryType: typedData.primaryType,
          message: { ...typedData.message, amount: typedData.message.amount.toString(),
            authorizationValidUntil: typedData.message.authorizationValidUntil.toString(), payableUntil: typedData.message.payableUntil.toString() },
          signature, signerMode: signer.mode, network: "Arc Testnet" as const,
        };
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw new AuthorizationError("AUTHORIZATION_DENIED", 503);
      }
    },
  };
}

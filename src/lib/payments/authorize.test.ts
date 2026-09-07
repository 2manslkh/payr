// @vitest-environment node
import { expect, it, vi } from "vitest";
import { hashTypedData, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { InvoiceAccessTarget } from "../documents/contracts";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { createAuthorizationService } from "./authorize";
import type { PaymentTypedData } from "../domain/payment-authorization";

function setup() {
  const snapshot = testPublicationSnapshot();
  const hash = `0x${"3".repeat(64)}` as const;
  const id = "00000000-0000-4000-8000-000000000001";
  const target: InvoiceAccessTarget = {
    invoiceId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", commercialState: "published",
    payableUntil: snapshot.payableUntil, voidedAt: null, snapshot, settlement: null, receipt: null, deliveries: [],
    attempt: {
      id, workspaceId: id, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1, invoiceNumber: "INV-2030-000001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: `0x${"4".repeat(40)}`, invoiceKey: hash,
      publicationSalt: hash, storageKey: "private.pdf", leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null,
      finalizedAt: "2030-01-01T00:00:00.000Z",
      link: { tokenId: id, keyVersion: 1, verifierHash: "hash", activatedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z", revokedAt: null },
      artifact: { pdfFilename: "invoice.pdf", contentType: "application/pdf", byteLength: 100, invoiceDataHash: hash,
        pdfContentHash: hash, documentCommitment: hash, qrVerified: true },
    },
  };
  const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
  const signer = { attestor: account.address, mode: "local-testnet" as const, sign: vi.fn((data: PaymentTypedData) => account.signTypedData(data)) };
  const access = { resolve: vi.fn().mockImplementation(async () => structuredClone(target)) };
  const repository = { recordPaymentAuthorization: vi.fn().mockImplementation(async (input) => input.authorizationId) };
  const now = vi.fn(() => Date.parse("2030-01-02T00:00:00.000Z"));
  return { target, signer, access, repository, now, service: createAuthorizationService({ access, repository, signer, now }) };
}

it("signs frozen facts and persists only hashes before returning authorization", async () => {
  const { service, repository, signer, target } = setup();
  const result = await service.authorize("bearer", "local");
  const typed = signer.sign.mock.calls[0][0];
  expect(typed.domain.verifyingContract).toBe(target.attempt.contractAddress);
  expect(repository.recordPaymentAuthorization).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    typedDataDigest: hashTypedData(typed), signatureHash: keccak256(result.signature), signerMode: "local-testnet",
    amountAtomic: target.snapshot!.amountAtomic, invoiceVersionId: target.attempt.invoiceVersionId,
  }));
  expect(JSON.stringify(repository.recordPaymentAuthorization.mock.calls)).not.toContain(result.signature);
  expect(result.message.amount).toBe(target.snapshot!.amountAtomic);
  expect(result).not.toHaveProperty("workspaceId");
});

it.each(["voided", "expired", "draft"] as const)("denies %s before signing", async (state) => {
  const { service, target, signer } = setup(); target.commercialState = state;
  await expect(service.authorize("bearer", "local")).rejects.toThrow("AUTHORIZATION_NOT_PAYABLE");
  expect(signer.sign).not.toHaveBeenCalled();
});

it("denies invalid/wrong-purpose bearer resolution", async () => {
  const { service, access, signer } = setup();
  access.resolve.mockResolvedValue(null);
  await expect(service.authorize("wrong-purpose", "local")).rejects.toThrow("INVOICE_UNAVAILABLE");
  expect(signer.sign).not.toHaveBeenCalled();
});

it("denies already-recorded settlement without signing", async () => {
  const { service, target, signer } = setup();
  Object.assign(target, { settlement: { transactionHash: `0x${"1".repeat(64)}` } });
  await expect(service.authorize("bearer", "local")).rejects.toThrow("AUTHORIZATION_NOT_PAYABLE");
  expect(signer.sign).not.toHaveBeenCalled();
});

it("denies exact expiry and the last second with no viable authorization window", async () => {
  for (const delta of [0, -1, -999]) {
    const { service, target, now, signer } = setup();
    now.mockReturnValue(Date.parse(target.payableUntil!) + delta);
    await expect(service.authorize("bearer", "local")).rejects.toThrow("AUTHORIZATION_NOT_PAYABLE");
    expect(signer.sign).not.toHaveBeenCalled();
  }
});

it("returns no signature on signer denial, invalid recovery, or persistence failure", async () => {
  for (const failure of ["denied", "invalid", "database"]) {
    const { service, signer, repository } = setup();
    if (failure === "denied") signer.sign.mockRejectedValue(new Error("secret provider details"));
    if (failure === "invalid") signer.sign.mockImplementation((data) => privateKeyToAccount(`0x${"0".repeat(63)}2`).signTypedData(data));
    if (failure === "database") repository.recordPaymentAuthorization.mockRejectedValue(new Error("secret database details"));
    await expect(service.authorize("bearer", "local")).rejects.toThrow("AUTHORIZATION_DENIED");
    if (failure !== "database") expect(repository.recordPaymentAuthorization).not.toHaveBeenCalled();
  }
});

it("rechecks bearer access after signing to close revocation during signing", async () => {
  const { service, target, access, repository, signer } = setup();
  access.resolve.mockResolvedValueOnce(structuredClone(target)).mockResolvedValueOnce(null);
  await expect(service.authorize("bearer", "local")).rejects.toThrow();
  expect(signer.sign).toHaveBeenCalledOnce();
  expect(repository.recordPaymentAuthorization).not.toHaveBeenCalled();
});

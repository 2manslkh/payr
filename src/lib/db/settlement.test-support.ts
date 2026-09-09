import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fixtureDatabaseContainer } from "../../../scripts/local-test-config.mjs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSupabaseAdminClient } from "./admin";
import { createIdentityRepository } from "./identity";
import { createDraftRepository } from "./drafts";
import { createPublicationRepository } from "./publication";
import { createReconciliationRepository } from "./reconciliation";
import { createAuthService } from "../auth/service";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { receiptRecipients } from "../email/address";
import type { IdentitySession } from "../identity/contracts";

export function sql(query: string) {
  const container = fixtureDatabaseContainer();
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"],
    { encoding: "utf8", input: query, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export async function publishedFixture(sameRecipient = false, keys: ReadonlyMap<number, Uint8Array> = new Map([[1, randomBytes(32)]]), seededIdentity?: IdentitySession) {
  fixtureDatabaseContainer();
  const db = createSupabaseAdminClient(); const identity = createIdentityRepository(db);
  let session = seededIdentity;
  if (!session) {
    const account = privateKeyToAccount(generatePrivateKey());
    const auth = createAuthService(identity, { appOrigin: "https://example.test", chainId: 5042002, sessionKey: randomBytes(32), connectorPepper: randomBytes(32) });
    const nonce = await auth.issue({ purpose: "payr-login-v1", wallet: account.address });
    session = (await auth.verify({ nonceId: nonce.nonceId, signature: await account.signMessage({ message: nonce.message }) })).session;
  }
  const actor = { ...session, connectorId: null };
  const snapshot = testPublicationSnapshot();
  if (sameRecipient) snapshot.client.contactEmail = "owner@example.test";
  const profile = await identity.getProfile(session);
  snapshot.sender = await identity.saveProfile(session, { expectedRevision: profile.revision, businessName: snapshot.sender.businessName!,
    billingAddress: snapshot.sender.billingAddress!, contactName: "Test Owner", contactEmail: "owner@example.test", invoicePrefix: "TEST", defaultPaymentTermsDays: 30 });
  const client = await identity.saveClient(session, { id: null, expectedRevision: null, alias: "test-client", ...snapshot.client });
  snapshot.clientReference = { id: client.id, alias: client.alias, revision: client.revision };
  const draft = await createDraftRepository(db).saveDraft(actor, { draftId: null, expectedVersion: null, snapshot,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex") });
  const publication = createPublicationRepository(db);
  const hash = () => `0x${randomBytes(32).toString("hex")}` as const;
  const invoiceTokenId = randomUUID();
  const invoiceToken = createKeyedTokenCodec(keys).derive(invoiceTokenId, "invoice-bearer", 1);
  const reserved = await publication.reserve(actor, { draftId: draft.draftId, expectedVersion: 1, approval: true,
    idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex"), attemptId: randomUUID(),
    invoiceKey: hash(), publicationSalt: hash(), tokenId: invoiceTokenId, keyVersion: 1, verifierHash: invoiceToken.verifierHash,
    chainId: 5042002, contractAddress: `0x${randomBytes(20).toString("hex")}` });
  const claimed = (await publication.claim(reserved.id, randomUUID()))!;
  const fence = { attemptId: claimed.id, leaseOwner: claimed.leaseOwner!, fence: claimed.fence };
  await publication.store({ ...fence, artifact: { pdfFilename: `${reserved.invoiceNumber}.pdf`, contentType: "application/pdf", byteLength: 100,
    invoiceDataHash: hash(), pdfContentHash: hash(), documentCommitment: hash(), qrVerified: true } });
  const target = (await publication.finalize(fence))!;
  return { db, actor, target, draft, publication, hash, keys };
}

export async function settledFixture(sameRecipient = false, linkKeys?: ReadonlyMap<number, Uint8Array>, receiptKeyVersion = 1, seededIdentity?: IdentitySession) {
  const fixture = await publishedFixture(sameRecipient, linkKeys, seededIdentity);
  const { db, actor, target, hash, keys } = fixture;
  const tokenId = randomUUID();
  const token = createKeyedTokenCodec(keys).derive(tokenId, "receipt-bearer", receiptKeyVersion);
  const result = await createReconciliationRepository(db).recordSettlement({ workspaceId: actor.workspaceId, chainId: 5042002,
    contractAddress: target.contractAddress, invoiceKey: target.invoiceKey, transactionHash: hash(), logIndex: 0,
    blockNumber: "100", blockTime: new Date().toISOString(), documentCommitment: target.artifact!.documentCommitment,
    payer: `0x${"5".repeat(40)}`, payee: target.snapshot.sender.payoutWallet as `0x${string}`, amountAtomic: target.snapshot.amountAtomic,
    receiptTokenId: tokenId, receiptKeyVersion, receiptVerifierHash: token.verifierHash, receiptExpiresAt: "2035-01-01T00:00:00Z",
    deliveries: receiptRecipients(target.snapshot.sender.contactEmail!, target.snapshot.client.contactEmail) });
  return { ...fixture, ...result, receiptTokenId: tokenId };
}

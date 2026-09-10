// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { IdentityError } from "../identity/contracts";
import { createKeyedTokenCodec } from "../security/keyed-token";
import type { InvoiceActor } from "./contracts";
import { buildGmailPackage } from "./gmail-package";
import { createPublicationService } from "./publication";
import { PublicationError, type InvoiceDocumentPort, type PublicationAttempt, type PublicationConfig, type PublicationFence, type PublicationRepository, type PublicationStatusData } from "./publication-contracts";
import { createPublicationWorker } from "./publication-worker";
import { createInvoiceLifecycleService } from "./lifecycle";
import { createTestDocumentPort, testPublicationSnapshot } from "./publication.test-support";

// The lifecycle lane owns this frozen seam; integration exercises the real builder.
vi.mock("./gmail-package", () => ({ buildGmailPackage: vi.fn((input) => ({
  to: [input.snapshot.client.contactEmail], subject: input.invoiceNumber, textBody: "Gmail seam", htmlBody: "Gmail seam",
  paymentUrl: input.invoiceUrl, invoicePdfUrl: input.invoicePdfUrl,
})) }));

const actor: InvoiceActor = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"2".repeat(40)}`, connectorId: null };
const input = { draftId: "00000000-0000-4000-8000-000000000003", expectedVersion: 1, approval: true, deliveryApproval: true, idempotencyKey: "publish-1" };
const emailConfig = { from: "Payr <sender@example.test>", appOrigin: "https://payrlink.xyz", templateVersion: "invoice-issued-v1" as const, network: "Arc Testnet" as const };
const invoiceDeliveries = [{ roles: ["client" as const], state: "pending" as const, attemptCount: 0, nextAttemptAt: null },
  { roles: ["issuer" as const], state: "pending" as const, attemptCount: 0, nextAttemptAt: null }];
const dependencies = (config: PublicationConfig, documents: InvoiceDocumentPort) => ({
  getLinkConfig: () => config, getReservationConfig: () => config, getDocuments: () => documents,
  getEmailConfig: () => emailConfig,
});

function setup() {
  const config: PublicationConfig = {
    appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", activeKeyVersion: 1,
    keys: new Map([[1, new Uint8Array(32).fill(7)]]), chainId: 5042002, contractAddress: `0x${"1".repeat(40)}`,
  };
  const attempts = new Map<string, PublicationAttempt>();
  const replays = new Map<string, { fingerprint: string; id: string }>();
  const objects = new Map<string, Uint8Array>();
  const state = { sequence: 0, commercialState: "draft" as PublicationStatusData["commercialState"], canPublish: true };
  const copy = <T>(value: T): T => structuredClone(value);
  function fenced(fence: PublicationFence) {
    const attempt = attempts.get(fence.attemptId);
    return attempt && attempt.leaseOwner === fence.leaseOwner && attempt.fence === fence.fence
      && Date.parse(attempt.leaseUntil!) > Date.now() && ["rendering", "stored"].includes(attempt.state) ? attempt : null;
  }
  const repository: PublicationRepository = {
    findReplay: vi.fn(async (_actor, key, fingerprint) => {
      if (!state.canPublish) throw new IdentityError("FORBIDDEN", 403);
      const replay = replays.get(key);
      if (!replay) return null;
      if (replay.fingerprint !== fingerprint) throw new PublicationError("IDEMPOTENCY_CONFLICT");
      return copy(attempts.get(replay.id)!);
    }),
    reserve: vi.fn(async (_actor, reservation) => {
      if (!state.canPublish) throw new IdentityError("FORBIDDEN", 403);
      const replay = replays.get(reservation.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== reservation.requestFingerprint) throw new PublicationError("IDEMPOTENCY_CONFLICT");
        return copy(attempts.get(replay.id)!);
      }
      if ([...attempts.values()].some((a) => ["reserved", "rendering", "stored"].includes(a.state))) throw new PublicationError("PUBLICATION_IN_PROGRESS");
      if (state.commercialState !== "draft") throw new PublicationError("DRAFT_NOT_EDITABLE");
      const attempt: PublicationAttempt = {
        id: reservation.attemptId, workspaceId: actor.workspaceId, invoiceId: reservation.draftId, invoiceVersionId: randomUUID(),
        invoiceVersion: reservation.expectedVersion, invoiceNumber: `INV-2030-${String(++state.sequence).padStart(6, "0")}`,
        state: "reserved", snapshot: testPublicationSnapshot(), chainId: reservation.chainId, contractAddress: reservation.contractAddress,
        invoiceKey: reservation.invoiceKey, publicationSalt: reservation.publicationSalt,
        storageKey: `workspace/${actor.workspaceId}/invoice/${reservation.draftId}/${reservation.expectedVersion}/attempt/${reservation.attemptId}.pdf`,
        link: { tokenId: reservation.tokenId, keyVersion: reservation.keyVersion, verifierHash: reservation.verifierHash, appOrigin: reservation.emailConfig?.appOrigin,
          expiresAt: "2031-03-02T00:00:00.000Z", activatedAt: null, revokedAt: null },
        leaseOwner: null, leaseUntil: null, fence: "0", artifact: null, failureCode: null, finalizedAt: null,
      };
      attempts.set(attempt.id, attempt);
      replays.set(reservation.idempotencyKey, { fingerprint: reservation.requestFingerprint, id: attempt.id });
      return copy(attempt);
    }),
    claim: vi.fn(async (id, leaseOwner) => {
      const attempt = id ? attempts.get(id) : [...attempts.values()].find((a) =>
        ["reserved", "rendering", "stored"].includes(a.state) && (!a.leaseUntil || Date.parse(a.leaseUntil) <= Date.now()));
      if (!attempt || !["reserved", "rendering", "stored"].includes(attempt.state)
        || (attempt.leaseUntil && Date.parse(attempt.leaseUntil) > Date.now())) return null;
      if (attempt.state !== "stored") attempt.state = "rendering";
      attempt.leaseOwner = leaseOwner;
      attempt.leaseUntil = new Date(Date.now() + 60_000).toISOString();
      attempt.fence = (BigInt(attempt.fence) + 1n).toString();
      return copy(attempt);
    }),
    store: vi.fn(async (write) => {
      const attempt = fenced(write);
      if (!attempt) return null;
      if (attempt.artifact && canonicalJson(attempt.artifact) !== canonicalJson(write.artifact)) throw new Error("Immutable artifact");
      attempt.artifact = copy(write.artifact);
      attempt.state = "stored";
      return copy(attempt);
    }),
    finalize: vi.fn(async (fence) => {
      const attempt = fenced(fence);
      if (!attempt) return null;
      if (attempt.state !== "stored" || !attempt.artifact) throw new Error("Unverified artifact");
      attempt.state = "finalized";
      attempt.finalizedAt = new Date().toISOString();
      attempt.link.activatedAt = attempt.finalizedAt;
      state.commercialState = "published";
      return copy(attempt);
    }),
    fail: vi.fn(async (write) => {
      const attempt = fenced(write);
      if (!attempt) return null;
      attempt.state = "failed";
      attempt.failureCode = write.failureCode;
      attempt.link.revokedAt = new Date().toISOString();
      return copy(attempt);
    }),
    statusData: vi.fn(async () => {
      const attempt = [...attempts.values()].at(-1);
      return attempt ? copy({ invoiceId: attempt.invoiceId, invoiceVersion: attempt.invoiceVersion,
        invoiceNumber: attempt.state === "finalized" ? attempt.invoiceNumber : null, commercialState: state.commercialState,
        payableUntil: attempt.state === "finalized" ? attempt.snapshot.payableUntil : null, voidedAt: null,
        snapshot: attempt.snapshot, attempt, settlement: null, receipt: null, deliveries: [], invoiceDeliveries: attempt.state === "finalized" ? invoiceDeliveries : [] }) : null;
    }),
    voidInvoice: vi.fn(), expire: vi.fn(),
  };
  const createOrRead = vi.fn(createTestDocumentPort(objects).createOrRead);
  const service = createPublicationService(repository, dependencies(config, { createOrRead }));
  return { service, repository, config, attempts, replays, objects, state, createOrRead };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z")); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

it("requires explicit delivery approval and a configured mail gate before fresh writes", async () => {
  const { repository, config, createOrRead } = setup();
  const getEmailConfig = vi.fn(() => { throw new PublicationError("INVOICE_EMAIL_DISABLED", 503); });
  const service = createPublicationService(repository, { ...dependencies(config, { createOrRead }), getEmailConfig });
  await expect(service.publish(actor, { ...input, deliveryApproval: undefined })).rejects.toMatchObject({ code: "DELIVERY_APPROVAL_REQUIRED" });
  expect(getEmailConfig).not.toHaveBeenCalled();
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "INVOICE_EMAIL_DISABLED" });
  expect(repository.reserve).not.toHaveBeenCalled(); expect(repository.claim).not.toHaveBeenCalled(); expect(createOrRead).not.toHaveBeenCalled();
});

it("reads a historical finalized v1 replay with email disabled, without backfill or dispatch", async () => {
  const { service, repository, config, createOrRead, attempts } = setup();
  await service.publish(actor, input);
  const attempt = [...attempts.values()][0];
  vi.mocked(repository.findReplay).mockResolvedValue(attempt);
  const status = (await repository.statusData(actor, input.draftId))!;
  vi.mocked(repository.statusData).mockResolvedValue({ ...status, invoiceDeliveries: [] });
  const afterPublication = vi.fn();
  const getEmailConfig = vi.fn(() => { throw new Error("disabled"); });
  vi.clearAllMocks();
  const result = await createPublicationService(repository, { ...dependencies(config, { createOrRead }), getEmailConfig, afterPublication })
    .publish(actor, { ...input, deliveryApproval: undefined });
  expect(result).toMatchObject({ sendApprovalRequired: true, invoiceEmail: { state: "not_applicable", deliveries: [] } });
  expect(getEmailConfig).not.toHaveBeenCalled(); expect(afterPublication).not.toHaveBeenCalled();
  expect(repository.reserve).not.toHaveBeenCalled(); expect(repository.finalize).not.toHaveBeenCalled();
});

it("schedules only the committed attempt and does not undo it on callback failure", async () => {
  const { repository, config, createOrRead } = setup();
  const afterPublication = vi.fn(() => { throw new Error("scheduler unavailable"); });
  const result = await createPublicationService(repository, { ...dependencies(config, { createOrRead }), afterPublication }).publish(actor, input);
  expect(result.invoiceEmail.state).toBe("queued");
  const attemptId = vi.mocked(repository.reserve).mock.calls[0][1].attemptId;
  expect(afterPublication).toHaveBeenCalledExactlyOnceWith(attemptId);
  expect(vi.mocked(repository.finalize).mock.invocationCallOrder[0]).toBeLessThan(afterPublication.mock.invocationCallOrder[0]);
});

it("does not upgrade a recorded v1 approval by adding deliveryApproval to the same key", async () => {
  const { service, repository, replays } = setup();
  await service.publish(actor, input);
  const recorded = replays.get(input.idempotencyKey)!;
  recorded.fingerprint = createHash("sha256").update(canonicalJson({ operation: "publish_invoice", workspaceId: actor.workspaceId,
    draftId: input.draftId, expectedVersion: input.expectedVersion, approval: true })).digest("hex");
  vi.clearAllMocks();
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(repository.reserve).not.toHaveBeenCalled(); expect(repository.finalize).not.toHaveBeenCalled();
});

it.each([
  { approval: false }, { approval: undefined }, { approval: "true" }, { expectedVersion: 0 }, { expectedVersion: 1.5 },
  { expectedVersion: "1" }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { draftId: "bad" }, { idempotencyKey: " " },
  { idempotencyKey: "x".repeat(129) }, { workspaceId: actor.workspaceId }, { actor }, { chainId: 1 }, { publicationSalt: "secret" },
])("rejects invalid approval/input before all writes (%#)", async (change) => {
  const { service, repository, createOrRead } = setup();
  await expect(service.publish(actor, { ...input, ...change })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(repository.reserve).not.toHaveBeenCalled();
  expect(repository.claim).not.toHaveBeenCalled();
  expect(createOrRead).not.toHaveBeenCalled();
});

it.each([
  { ...actor, connectorId: randomUUID() }, { ...actor, ownerWallet: null }, { ...actor, workspaceId: "bad" },
  { ...actor, ownerWallet: "bad" }, { ...actor, scopes: ["invoice:publish"] },
])("rejects invalid F3 actors before reservation (%#)", async (value) => {
  const { service, repository } = setup();
  await expect(service.publish(value, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(repository.reserve).not.toHaveBeenCalled();
});

it("publishes through the real worker with exact fingerprint, active-key HMAC metadata, and an explicit Gmail package", async () => {
  const { service, repository, config, attempts, objects } = setup();
  const result = await service.publish(actor, input);
  const reservation = vi.mocked(repository.reserve).mock.calls[0][1];
  expect(reservation.requestFingerprint).toBe(createHash("sha256").update(
    '{"approval":true,"deliveryApproval":true,"draftId":"00000000-0000-4000-8000-000000000003","expectedVersion":1,"operation":"publish_invoice","workspaceId":"00000000-0000-4000-8000-000000000001"}',
  ).digest("hex"));
  expect(reservation).toEqual({ ...input, emailConfig, requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    attemptId: expect.any(String), invoiceKey: expect.stringMatching(/^0x[0-9a-f]{64}$/), publicationSalt: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    tokenId: expect.any(String), keyVersion: 1, verifierHash: expect.stringMatching(/^[0-9a-f]{64}$/), chainId: config.chainId, contractAddress: config.contractAddress });
  expect(reservation.attemptId).not.toBe(reservation.tokenId);
  expect(reservation.invoiceKey).not.toBe(reservation.publicationSalt);
  const token = createKeyedTokenCodec(config.keys).derive(reservation.tokenId, "invoice-bearer", 1);
  expect(reservation.verifierHash).toBe(token.verifierHash);
  const attempt = [...attempts.values()][0];
  expect(result).toEqual({
    invoiceId: input.draftId, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", commercialState: "published",
    invoiceUrl: `${config.appOrigin}/invoice/${token.slug}`, invoicePdfUrl: `${config.appOrigin}/invoice/${token.slug}/pdf`,
    pdfFilename: "INV-2030-000001.pdf", pdfContentHash: attempt.artifact!.pdfContentHash, documentCommitment: attempt.artifact!.documentCommitment,
    gmailLinkPackage: { to: ["client@example.test"], subject: "INV-2030-000001", textBody: "Gmail seam", htmlBody: "Gmail seam",
      paymentUrl: `${config.appOrigin}/invoice/${token.slug}`, invoicePdfUrl: `${config.appOrigin}/invoice/${token.slug}/pdf` }, sendApprovalRequired: false,
    invoiceEmail: { state: "queued", deliveries: invoiceDeliveries },
  });
  expect(buildGmailPackage).toHaveBeenCalledExactlyOnceWith({ snapshot: attempt.snapshot, invoiceNumber: attempt.invoiceNumber,
    invoiceUrl: result.invoiceUrl, invoicePdfUrl: result.invoicePdfUrl });
  expect(objects.size).toBe(1);
  expect(JSON.stringify(reservation)).not.toContain(token.slug);
  expect(JSON.stringify(attempt)).not.toContain(token.slug);
  expect(JSON.stringify(result)).not.toContain(attempt.publicationSalt);
});

it.each(["owner", "connector"])("passes the normalized %s actor to repository authorization, including replay", async (kind) => {
  const { service, repository, state } = setup();
  const scope = kind === "owner" ? actor : { ...actor, ownerWallet: null, connectorId: randomUUID() };
  await service.publish(scope, input);
  expect(repository.reserve).toHaveBeenCalledWith(scope, expect.any(Object));
  state.canPublish = false;
  await expect(service.publish(scope, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(repository.claim).toHaveBeenCalledTimes(1);
});

it("reconstructs a finalized retry after restart using stored binding/key metadata and current commercial state", async () => {
  const { service, repository, config, attempts, objects, state } = setup();
  const first = await service.publish(actor, input);
  const rotated: PublicationConfig = { ...config, chainId: 42, contractAddress: `0x${"5".repeat(40)}`, activeKeyVersion: 2,
    keys: new Map([[1, new Uint8Array(32).fill(7)], [2, new Uint8Array(32).fill(8)]]) };
  const fresh = createPublicationService(repository, dependencies(rotated, createTestDocumentPort(objects)));
  expect(await fresh.publish(actor, input)).toEqual(first);
  state.commercialState = "voided";
  [...attempts.values()][0].link.revokedAt = new Date().toISOString();
  expect(await fresh.publish(actor, input)).toEqual({ ...first, commercialState: "voided" });
  expect(repository.claim).toHaveBeenCalledTimes(1);
  expect(repository.finalize).toHaveBeenCalledTimes(1);
  expect(attempts.size).toBe(1);
  expect(repository.reserve).toHaveBeenCalledOnce();
  expect(vi.mocked(repository.findReplay).mock.calls[1][2]).toBe(vi.mocked(repository.findReplay).mock.calls[0][2]);
  expect([...attempts.values()][0]).toMatchObject({ chainId: config.chainId, contractAddress: config.contractAddress, link: { keyVersion: 1 } });
});

it("replays finalized artifacts with retained keys without current binding, active key, or document provider", async () => {
  const { service, repository, config } = setup();
  const published = await service.publish(actor, input);
  const getReservationConfig = vi.fn(() => { throw new PublicationError("CONFIGURATION_ERROR", 503); });
  const getDocuments = vi.fn(() => { throw new PublicationError("DOCUMENTS_NOT_CONFIGURED", 503); });
  const replay = createPublicationService(repository, { getLinkConfig: () => config, getReservationConfig, getDocuments });
  expect(await replay.publish(actor, input)).toEqual(published);
  expect(getReservationConfig).not.toHaveBeenCalled();
  expect(getDocuments).not.toHaveBeenCalled();
  expect(repository.reserve).toHaveBeenCalledOnce();
});

it("recovers an active attempt without current reservation configuration", async () => {
  const { service, repository, config, createOrRead, objects, attempts } = setup();
  createOrRead.mockRejectedValueOnce(new Error("temporary document outage"));
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
  vi.advanceTimersByTime(61_000);
  const getReservationConfig = vi.fn(() => { throw new PublicationError("CONFIGURATION_ERROR", 503); });
  const recovered = createPublicationService(repository, {
    getLinkConfig: () => config, getReservationConfig, getDocuments: () => createTestDocumentPort(objects),
  });
  expect((await recovered.publish(actor, input)).invoiceNumber).toBe("INV-2030-000001");
  expect(getReservationConfig).not.toHaveBeenCalled();
  expect(attempts.size).toBe(1);
});

it("does not claim a replay descriptor for a different invoice", async () => {
  const { service, repository, attempts } = setup();
  await service.publish(actor, input);
  vi.mocked(repository.claim).mockClear();
  vi.mocked(repository.findReplay).mockResolvedValue({ ...[...attempts.values()][0], invoiceId: randomUUID(), state: "reserved" });
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  expect(repository.claim).not.toHaveBeenCalled();
});

it("reports effective expiry on replay without re-finalizing or changing link lifetime", async () => {
  const { service, repository } = setup();
  const first = await service.publish(actor, input);
  vi.setSystemTime(new Date("2030-03-02T00:00:00.000Z"));
  expect(await service.publish(actor, input)).toEqual({ ...first, commercialState: "expired" });
  expect(repository.finalize).toHaveBeenCalledTimes(1);
});

it("does not fall back when a finalized attempt's retained key is missing", async () => {
  const { service, repository, config, objects } = setup();
  await service.publish(actor, input);
  const fresh = createPublicationService(repository, dependencies({ ...config, activeKeyVersion: 2, keys: new Map([[2, new Uint8Array(32).fill(8)]]) }, createTestDocumentPort(objects)));
  await expect(fresh.publish(actor, input)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
  expect(repository.claim).toHaveBeenCalledTimes(1);
});

it.each(["before_document", "after_upload", "before_store", "after_store", "before_finalize", "after_finalize"] as const)(
  "recovers %s with a fresh worker and retained old key, without reallocating or exposing a premature result", async (crash) => {
    const { service, repository, config, attempts, objects, state, createOrRead } = setup();
    const normalDocument = createTestDocumentPort(objects).createOrRead;
    const error = new Error("SECRET provider crash");
    if (crash === "before_document") createOrRead.mockRejectedValueOnce(error);
    if (crash === "after_upload") createOrRead.mockImplementationOnce(async (value) => { await normalDocument(value); throw error; });
    for (const method of ["store", "finalize"] as const) {
      const normal = repository[method];
      const implementation = vi.mocked(normal).getMockImplementation()!;
      if (crash === `before_${method}`) vi.mocked(normal).mockRejectedValueOnce(error);
      if (crash === `after_${method}`) {
        // Both RPCs have one fenced input; preserve the committed fake state before losing the response.
        vi.mocked(normal).mockImplementationOnce(async (value) => { await implementation(value as Parameters<typeof repository.store>[0]); throw error; });
      }
    }
    await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
    const attempt = [...attempts.values()][0];
    const reservedFacts = { id: attempt.id, invoiceNumber: attempt.invoiceNumber, invoiceKey: attempt.invoiceKey,
      publicationSalt: attempt.publicationSalt, storageKey: attempt.storageKey, tokenId: attempt.link.tokenId };
    const originalBytes = objects.get(attempt.storageKey)?.slice();
    if (crash !== "after_finalize") {
      expect(attempt.link.activatedAt).toBeNull();
      expect(state.commercialState).toBe("draft");
      await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_IN_PROGRESS" });
    }
    vi.advanceTimersByTime(60_000);
    const rotated: PublicationConfig = { ...config, appOrigin: "https://changed.test", chainId: 42, activeKeyVersion: 2,
      keys: new Map([[1, new Uint8Array(32).fill(7)], [2, new Uint8Array(32).fill(8)]]) };
    const freshDocuments = createTestDocumentPort(objects);
    const worker = createPublicationWorker(repository, rotated, freshDocuments);
    expect(await worker.run()).toEqual(crash === "after_finalize" ? { outcome: "idle" } : { outcome: "finalized", attemptId: attempt.id });
    const result = await createPublicationService(repository, dependencies(rotated, freshDocuments)).publish(actor, input);
    expect(result).toMatchObject({ invoiceNumber: reservedFacts.invoiceNumber, commercialState: "published", sendApprovalRequired: false });
    expect(new URL(result.invoiceUrl).origin).toBe(config.appOrigin);
    expect(result.invoicePdfUrl).toBe(`${result.invoiceUrl}/pdf`);
    expect({ id: attempt.id, invoiceNumber: attempt.invoiceNumber, invoiceKey: attempt.invoiceKey,
      publicationSalt: attempt.publicationSalt, storageKey: attempt.storageKey, tokenId: attempt.link.tokenId }).toEqual(reservedFacts);
    expect(attempt.fence).toBe(crash === "after_finalize" ? "1" : "2");
    expect(state.sequence).toBe(1);
    expect(attempts.size).toBe(1);
    expect(objects.size).toBe(1);
    if (originalBytes) expect(objects.get(attempt.storageKey)).toEqual(originalBytes);
    expect(repository.fail).not.toHaveBeenCalled();
  },
);

it.each(["reserved", "rendering", "stored"] as const)("foreground restart preserves approval origin and PDF identity from %s", async (stage) => {
  const { service, repository, config, attempts, objects, createOrRead } = setup();
  if (stage === "reserved") vi.mocked(repository.claim).mockResolvedValueOnce(null);
  if (stage === "rendering") createOrRead.mockImplementationOnce(async (value) => {
    await createTestDocumentPort(objects).createOrRead(value); throw new Error("Crash after upload");
  });
  if (stage === "stored") vi.mocked(repository.finalize).mockRejectedValueOnce(new Error("Crash before finalization"));
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: stage === "reserved" ? "PUBLICATION_IN_PROGRESS" : "PUBLICATION_RETRYABLE" });
  const original = [...attempts.values()][0];
  expect(original.state).toBe(stage);
  const bytes = objects.get(original.storageKey)?.slice();
  const artifact = structuredClone(original.artifact);
  vi.advanceTimersByTime(61_000);
  const rotated = { ...config, appOrigin: "https://changed.test", activeKeyVersion: 2,
    keys: new Map([...config.keys, [2, new Uint8Array(32).fill(9)] as const]) };
  const resumedRead = vi.fn(createTestDocumentPort(objects).createOrRead);
  const result = await createPublicationService(repository, dependencies(rotated, { createOrRead: resumedRead })).publish(actor, input);
  expect(new URL(result.invoiceUrl).origin).toBe(config.appOrigin);
  expect(result.invoicePdfUrl).toBe(`${result.invoiceUrl}/pdf`);
  expect(result.gmailLinkPackage.paymentUrl).toBe(result.invoiceUrl);
  expect(resumedRead).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ storageKey: original.storageKey, invoiceUrl: result.invoiceUrl }));
  if (bytes) expect(objects.get(original.storageKey)).toEqual(bytes);
  if (artifact) expect(original.artifact).toEqual(artifact);
  expect(objects.size).toBe(1);
  expect(repository.fail).not.toHaveBeenCalled();
  const lifecycle = createInvoiceLifecycleService(repository, () => rotated);
  expect((await lifecycle.share(actor, input.draftId)).invoiceUrl).toBe(result.invoiceUrl);
  expect((await lifecycle.status(actor, input.draftId)).invoiceDocument?.pageUrl).toBe(result.invoiceUrl);
});

it("allows only one live claimant for concurrent same-key calls and rejects different-key competing reservations", async () => {
  const { service, repository, state, createOrRead } = setup();
  const document = createOrRead.getMockImplementation()!;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  createOrRead.mockImplementation(async (value) => { await blocked; return document(value); });
  const first = service.publish(actor, input);
  await vi.waitFor(() => expect(createOrRead).toHaveBeenCalledOnce());
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_IN_PROGRESS" });
  await expect(service.publish(actor, { ...input, idempotencyKey: "second" })).rejects.toMatchObject({ code: "PUBLICATION_IN_PROGRESS" });
  expect(state.sequence).toBe(1);
  release();
  await expect(first).resolves.toMatchObject({ commercialState: "published" });
  expect(repository.finalize).toHaveBeenCalledOnce();
});

it("burns terminal failures, preserves same-key failure, and requires new approval/key for another number", async () => {
  const { service, repository, attempts, state, createOrRead } = setup();
  const document = createOrRead.getMockImplementation()!;
  createOrRead.mockImplementationOnce(async (value) => ({ ...await document(value), decodedQrDestination: "https://attacker.test/SECRET" }));
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_FAILED", failureCode: "ARTIFACT_VERIFICATION_FAILED" });
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_FAILED", failureCode: "ARTIFACT_VERIFICATION_FAILED" });
  expect(repository.claim).toHaveBeenCalledOnce();
  expect(state.sequence).toBe(1);
  await expect(service.publish(actor, { ...input, expectedVersion: 2 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect([...attempts.values()][0]).toMatchObject({ state: "failed", link: { activatedAt: null, revokedAt: expect.any(String) } });
  await expect(service.publish(actor, { ...input, idempotencyKey: "new-approved-attempt" })).resolves.toMatchObject({ invoiceNumber: "INV-2030-000002" });
  expect(state.sequence).toBe(2);
  const reservations = vi.mocked(repository.reserve).mock.calls.map((call) => call[1]);
  expect(new Set(reservations.map((r) => r.attemptId)).size).toBe(reservations.length);
  expect(new Set(reservations.map((r) => r.invoiceKey)).size).toBe(reservations.length);
  expect(new Set(reservations.map((r) => r.publicationSalt)).size).toBe(reservations.length);
  expect(new Set(reservations.map((r) => r.tokenId)).size).toBe(reservations.length);
});

it("a stale worker loses its fence after a fresh worker finalizes the same object", async () => {
  const { service, repository, config, objects, createOrRead, attempts } = setup();
  const document = createOrRead.getMockImplementation()!;
  createOrRead.mockImplementationOnce(async (value) => {
    const proof = await document(value);
    vi.advanceTimersByTime(60_000);
    expect(await createPublicationWorker(repository, config, createTestDocumentPort(objects)).run()).toMatchObject({ outcome: "finalized" });
    return proof;
  });
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "LEASE_LOST" });
  expect([...attempts.values()][0]).toMatchObject({ state: "finalized", fence: "2" });
  expect(repository.fail).not.toHaveBeenCalled();
  expect(repository.finalize).toHaveBeenCalledOnce();
  await expect(service.publish(actor, input)).resolves.toMatchObject({ invoiceNumber: "INV-2030-000001" });
});

it.each(["zero_contract", "bad_chain", "missing_key"])("rejects %s configuration before any reservation", async (kind) => {
  const { service, repository, config } = setup();
  if (kind === "zero_contract") config.contractAddress = `0x${"0".repeat(40)}`;
  if (kind === "bad_chain") config.chainId = 0;
  if (kind === "missing_key") config.activeKeyVersion = 2;
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  expect(repository.reserve).not.toHaveBeenCalled();
});

it("keeps a stored attempt retryable with a missing old key, then resumes unchanged when the key is restored", async () => {
  const { service, repository, config, objects, attempts } = setup();
  vi.mocked(repository.finalize).mockRejectedValueOnce(new Error("crash before final commit"));
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
  const attempt = [...attempts.values()][0];
  const artifact = structuredClone(attempt.artifact);
  const bytes = objects.get(attempt.storageKey)!.slice();
  vi.advanceTimersByTime(60_000);
  const keys = new Map([[2, new Uint8Array(32).fill(8)]]);
  const fresh = createPublicationService(repository, dependencies({ ...config, activeKeyVersion: 2, keys }, createTestDocumentPort(objects)));
  await expect(fresh.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
  expect(attempt.state).toBe("stored");
  expect(attempt.link.activatedAt).toBeNull();
  expect(repository.fail).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  keys.set(1, new Uint8Array(32).fill(7));
  await expect(fresh.publish(actor, input)).resolves.toMatchObject({ invoiceNumber: attempt.invoiceNumber });
  expect(attempt.artifact).toEqual(artifact);
  expect(objects.get(attempt.storageKey)).toEqual(bytes);
  expect(repository.store).toHaveBeenCalledOnce();
});

it.each(["changed bytes", "changed QR"])("rejects %s in an existing stored object without replacing its metadata", async (kind) => {
  const { service, repository, objects, attempts } = setup();
  vi.mocked(repository.finalize).mockRejectedValueOnce(new Error("crash"));
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
  const attempt = [...attempts.values()][0];
  const artifact = structuredClone(attempt.artifact);
  const text = new TextDecoder().decode(objects.get(attempt.storageKey)!);
  const altered = kind === "changed QR" ? text.replace("https://payrlink.xyz/invoice/", "https://attacker.test/invoice/") : text.replace("\n%%EOF", " \n%%EOF");
  objects.set(attempt.storageKey, new TextEncoder().encode(altered));
  vi.advanceTimersByTime(60_000);
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_FAILED", failureCode: "ARTIFACT_VERIFICATION_FAILED" });
  expect(attempt.artifact).toEqual(artifact);
  expect(attempt.link.activatedAt).toBeNull();
  expect(repository.store).toHaveBeenCalledOnce();
  expect(repository.finalize).toHaveBeenCalledOnce();
});

it.each(["PROFILE_CONFLICT", "CLIENT_CONFLICT", "AUTH_REVOKED", "DEADLINE_EXPIRED", "VERSION_CONFLICT"] as const)(
  "reports terminal finalization conflict %s and never exposes a Gmail/link result", async (failureCode) => {
    const { service, repository, attempts } = setup();
    vi.mocked(repository.finalize).mockImplementationOnce((fence) => repository.fail({ ...fence, failureCode }));
    await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_FAILED", failureCode });
    expect(buildGmailPackage).not.toHaveBeenCalled();
    expect([...attempts.values()][0]).toMatchObject({ state: "failed", link: { activatedAt: null } });
  },
);

it.each(["wrong attempt", "unfinalized", "unverified", "inactive", "wrong version"])("does not reconstruct links from %s status data", async (kind) => {
  const { service, repository, attempts } = setup();
  await service.publish(actor, input);
  const data = (await repository.statusData(actor, input.draftId))!;
  if (kind === "wrong attempt") data.attempt!.id = randomUUID();
  if (kind === "unfinalized") data.attempt!.state = "stored";
  if (kind === "unverified") data.attempt!.artifact = null;
  if (kind === "inactive") data.attempt!.link.activatedAt = null;
  if (kind === "wrong version") data.invoiceVersion++;
  vi.mocked(repository.statusData).mockResolvedValue(data);
  vi.mocked(buildGmailPackage).mockClear();
  await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_RETRYABLE" });
  expect(buildGmailPackage).not.toHaveBeenCalled();
  expect(attempts.size).toBe(1);
  expect(repository.finalize).toHaveBeenCalledOnce();
});

it.each([new IdentityError("FORBIDDEN", 403), new Error("SECRET provider failure")])(
  "preserves the terminal worker outcome when failure details cannot be reread (%#)", async (error) => {
    const { service, repository } = setup();
    vi.mocked(repository.finalize).mockImplementationOnce((fence) => repository.fail({ ...fence, failureCode: "AUTH_REVOKED" }));
    vi.mocked(repository.statusData).mockRejectedValue(error);
    await expect(service.publish(actor, input)).rejects.toMatchObject({ code: "PUBLICATION_FAILED", failureCode: undefined });
    expect(buildGmailPackage).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledOnce();
  },
);

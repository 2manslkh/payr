// @vitest-environment node
import { randomUUID } from "node:crypto";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { expect, it, vi } from "vitest";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { createPublicationWorker } from "./publication-worker";
import type { InvoiceDocumentPort, PublicationAttempt, PublicationLinkConfig, PublicationRepository } from "./publication-contracts";
import { canonicalPublicationJson, publicationLink } from "./publication-links";
import { createTestDocumentPort, testPublicationSnapshot } from "./publication.test-support";

function setup() {
  const config: PublicationLinkConfig = {
    appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app",
    keys: new Map([[1, new Uint8Array(32).fill(7)]]),
  };
  const tokenId = randomUUID();
  const attempt: PublicationAttempt = {
    id: randomUUID(), workspaceId: randomUUID(), invoiceId: randomUUID(), invoiceVersionId: randomUUID(), invoiceVersion: 1,
    invoiceNumber: "INV-2030-000001", state: "rendering", snapshot: testPublicationSnapshot(), chainId: 5042002,
    contractAddress: `0x${"1".repeat(40)}`, invoiceKey: `0x${"3".repeat(64)}`, publicationSalt: `0x${"4".repeat(64)}`,
    storageKey: "private-attempt.pdf", link: {
      tokenId, keyVersion: 1, verifierHash: createKeyedTokenCodec(config.keys).derive(tokenId, "invoice-bearer", 1).verifierHash,
      expiresAt: "2031-03-02T00:00:00.000Z", activatedAt: null, revokedAt: null,
    }, leaseOwner: null, leaseUntil: "2030-01-01T00:01:00.000Z", fence: "9007199254740993", artifact: null, failureCode: null, finalizedAt: null,
  };
  const repository: PublicationRepository = {
    findReplay: vi.fn(),
    reserve: vi.fn(), statusData: vi.fn(), voidInvoice: vi.fn(), expire: vi.fn(),
    claim: vi.fn(async (_id, owner) => ({ ...attempt, leaseOwner: owner })),
    store: vi.fn<PublicationRepository["store"]>(async ({ artifact }) => ({ ...attempt, state: "stored", artifact })),
    finalize: vi.fn<PublicationRepository["finalize"]>(async () => ({ ...attempt, state: "finalized" })),
    fail: vi.fn<PublicationRepository["fail"]>(async ({ failureCode }) => ({ ...attempt, state: "failed", failureCode })),
  };
  const documents = createTestDocumentPort();
  const createOrRead = vi.fn(documents.createOrRead);
  return { config, attempt, repository, createOrRead, worker: createPublicationWorker(repository, config, { createOrRead }) };
}

it("does not call a provider or expose links when no work can be claimed", async () => {
  const createOrRead = vi.fn();
  const worker = createPublicationWorker({ claim: vi.fn().mockResolvedValue(null) } as unknown as PublicationRepository, {
    appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", keys: new Map([[1, new Uint8Array(32).fill(7)]]),
  }, { createOrRead });
  expect(await worker.run()).toEqual({ outcome: "idle" });
  expect(createOrRead).not.toHaveBeenCalled();
});

it("claims with a random UUID, independently verifies the artifact, and preserves a bigint fence as text", async () => {
  const { worker, repository, attempt, createOrRead, config } = setup();
  expect(await worker.run(attempt.id)).toEqual({ outcome: "finalized", attemptId: attempt.id });
  expect(repository.claim).toHaveBeenCalledWith(attempt.id, expect.stringMatching(/^[0-9a-f-]{14}4[0-9a-f-]{21}$/));
  const owner = vi.mocked(repository.claim).mock.calls[0][1];
  expect(createOrRead).toHaveBeenCalledExactlyOnceWith({
    storageKey: attempt.storageKey, canonicalInvoiceJson: canonicalPublicationJson(attempt), invoiceNumber: attempt.invoiceNumber,
    invoiceUrl: publicationLink(attempt.link, "invoice-bearer", config), publicationSalt: attempt.publicationSalt,
  });
  const proof = await createOrRead.mock.results[0].value;
  expect(repository.store).toHaveBeenCalledExactlyOnceWith({
    attemptId: attempt.id, leaseOwner: owner, fence: "9007199254740993", artifact: {
      pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: proof.byteLength,
      invoiceDataHash: proof.invoiceDataHash, pdfContentHash: proof.pdfContentHash, documentCommitment: proof.documentCommitment, qrVerified: true,
    },
  });
  expect(repository.finalize).toHaveBeenCalledExactlyOnceWith({ attemptId: attempt.id, leaseOwner: owner, fence: "9007199254740993" });
  const writes = JSON.stringify([vi.mocked(repository.store).mock.calls, vi.mocked(repository.finalize).mock.calls]);
  expect(writes).not.toContain("https:");
  expect(writes).not.toContain(attempt.publicationSalt);
  expect(writes).not.toContain("decodedQrDestination");
  expect(repository.fail).not.toHaveBeenCalled();
});

type Proof = Awaited<ReturnType<InvoiceDocumentPort["createOrRead"]>>;
it.each<[string, (proof: Proof) => unknown]>([
  ["missing proof", () => null],
  ["empty bytes", (proof) => ({ ...proof, bytes: new Uint8Array(), byteLength: 0 })],
  ["oversize bytes", (proof) => ({ ...proof, bytes: new Uint8Array(10 * 1024 * 1024 + 1) })],
  ["wrong magic", (proof) => ({ ...proof, bytes: new Uint8Array(proof.bytes.length) })],
  ["wrong type", (proof) => ({ ...proof, contentType: "text/plain" })],
  ["wrong length", (proof) => ({ ...proof, byteLength: proof.byteLength + 1 })],
  ["wrong canonical hash", (proof) => ({ ...proof, invoiceDataHash: `0x${"0".repeat(64)}` })],
  ["wrong PDF hash", (proof) => ({ ...proof, pdfContentHash: `0x${"0".repeat(64)}` })],
  ["wrong commitment", (proof) => ({ ...proof, documentCommitment: `0x${"0".repeat(64)}` })],
  ["wrong QR", (proof) => ({ ...proof, decodedQrDestination: "https://attacker.test/SECRET" })],
  ["missing QR", (proof) => ({ ...proof, decodedQrDestination: undefined })],
  ["normalized but not exact QR", (proof) => ({ ...proof, decodedQrDestination: proof.decodedQrDestination.replace("https:", "HTTPS:") })],
])("terminally fails %s before storing any metadata", async (_name, corrupt) => {
  const { worker, repository, createOrRead, attempt } = setup();
  createOrRead.mockImplementation(async (input) => corrupt(await createTestDocumentPort().createOrRead(input)) as Proof);
  expect(await worker.run(attempt.id)).toEqual({ outcome: "failed", attemptId: attempt.id });
  expect(repository.fail).toHaveBeenCalledExactlyOnceWith({
    attemptId: attempt.id, leaseOwner: expect.any(String), fence: attempt.fence, failureCode: "ARTIFACT_VERIFICATION_FAILED",
  });
  expect(repository.store).not.toHaveBeenCalled();
  expect(repository.finalize).not.toHaveBeenCalled();
});

it.each(["store", "finalize", "fail"] as const)("maps a null fenced %s to lease_lost without another write", async (method) => {
  const { worker, repository, attempt, createOrRead } = setup();
  vi.mocked(repository[method]).mockResolvedValue(null);
  if (method === "fail") createOrRead.mockResolvedValue(null as unknown as Proof);
  expect(await worker.run(attempt.id)).toEqual({ outcome: "lease_lost", attemptId: attempt.id });
  if (method !== "finalize") expect(repository.finalize).not.toHaveBeenCalled();
  if (method !== "fail") expect(repository.fail).not.toHaveBeenCalled();
});

it.each(["claim", "store", "finalize", "fail", "document"] as const)("keeps generic %s failures retryable with no terminal fallback", async (method) => {
  const { worker, repository, attempt, createOrRead } = setup();
  const error = new Error(`SECRET https://provider.test ${attempt.publicationSalt}`);
  if (method === "document") createOrRead.mockRejectedValue(error);
  else vi.mocked(repository[method]).mockRejectedValue(error);
  if (method === "fail") createOrRead.mockResolvedValue(null as unknown as Proof);
  expect(await worker.run(attempt.id)).toEqual({ outcome: "retryable", attemptId: attempt.id });
  if (method !== "fail") expect(repository.fail).not.toHaveBeenCalled();
});

it("re-reads a stored object without replacing verified metadata", async () => {
  const { worker, repository, attempt, createOrRead } = setup();
  await worker.run(attempt.id);
  attempt.artifact = vi.mocked(repository.store).mock.calls[0][0].artifact;
  attempt.state = "stored";
  vi.mocked(repository.store).mockClear();
  expect(await worker.run(attempt.id)).toEqual({ outcome: "finalized", attemptId: attempt.id });
  expect(createOrRead).toHaveBeenCalledTimes(2);
  expect(createOrRead.mock.calls[1]).toEqual(createOrRead.mock.calls[0]);
  expect(repository.store).not.toHaveBeenCalled();
});

it("terminally rejects a stored artifact whose immutable facts differ from read-back", async () => {
  const { worker, repository, attempt } = setup();
  await worker.run(attempt.id);
  attempt.artifact = { ...vi.mocked(repository.store).mock.calls[0][0].artifact, byteLength: 1 };
  attempt.state = "stored";
  vi.mocked(repository.store).mockClear();
  vi.mocked(repository.finalize).mockClear();
  expect(await worker.run(attempt.id)).toEqual({ outcome: "failed", attemptId: attempt.id });
  expect(repository.store).not.toHaveBeenCalled();
  expect(repository.finalize).not.toHaveBeenCalled();
});

it("does not fall back to the active key when the reserved key is unavailable", async () => {
  const { worker, config, repository, attempt, createOrRead } = setup();
  (config.keys as Map<number, Uint8Array>).delete(1);
  (config.keys as Map<number, Uint8Array>).set(2, new Uint8Array(32).fill(8));
  expect(await worker.run(attempt.id)).toEqual({ outcome: "retryable", attemptId: attempt.id });
  expect(createOrRead).not.toHaveBeenCalled();
  expect(repository.store).not.toHaveBeenCalled();
  expect(repository.fail).not.toHaveBeenCalled();
});

it("rejects invalid attempt selectors before claiming and distinguishes a busy targeted attempt", async () => {
  const { worker, repository, attempt } = setup();
  await expect(worker.run("SECRET")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(repository.claim).not.toHaveBeenCalled();
  vi.mocked(repository.claim).mockResolvedValue(null);
  expect(await worker.run(attempt.id)).toEqual({ outcome: "busy", attemptId: attempt.id });
});

it.each(["non-PDF", "high-bit magic", "oversize", "exactly 10 MiB"])("checks actual %s bytes even when every supplied hash/length agrees", async (kind) => {
  const { worker, attempt, repository, createOrRead } = setup();
  createOrRead.mockImplementation(async (input) => {
    const proof = await createTestDocumentPort().createOrRead(input);
    const bytes = new Uint8Array(kind === "oversize" ? 10 * 1024 * 1024 + 1 : kind === "exactly 10 MiB" ? 10 * 1024 * 1024 : 32);
    bytes.set(new TextEncoder().encode("%PDF-"));
    if (kind === "non-PDF") bytes[0] = 0;
    if (kind === "high-bit magic") bytes[0] |= 0x80;
    const pdfContentHash = keccak256(bytes);
    return { ...proof, bytes, byteLength: bytes.byteLength, pdfContentHash, documentCommitment: keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }], [input.publicationSalt, proof.invoiceDataHash, pdfContentHash],
    )) };
  });
  expect(await worker.run(attempt.id)).toEqual({ outcome: kind === "exactly 10 MiB" ? "finalized" : "failed", attemptId: attempt.id });
  if (kind !== "exactly 10 MiB") {
    expect(repository.store).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  }
});

it("rejects a self-consistent proof for a different canonical document", async () => {
  const { worker, attempt, repository, createOrRead } = setup();
  createOrRead.mockImplementation(async (input) => createTestDocumentPort().createOrRead({
    ...input, canonicalInvoiceJson: input.canonicalInvoiceJson.replace('"invoiceVersion":1', '"invoiceVersion":2'),
  }));
  expect(await worker.run(attempt.id)).toEqual({ outcome: "failed", attemptId: attempt.id });
  expect(repository.store).not.toHaveBeenCalled();
});

it("rejects textual hex concatenation instead of the ABI-encoded salt/hash commitment", async () => {
  const { worker, attempt, createOrRead, repository } = setup();
  createOrRead.mockImplementation(async (input) => {
    const proof = await createTestDocumentPort().createOrRead(input);
    // Hashing the textual hex fields is not ABI encoding the three bytes32 values.
    return { ...proof, documentCommitment: keccak256(toHex(`${input.publicationSalt}${proof.invoiceDataHash}${proof.pdfContentHash}`)) };
  });
  expect(await worker.run(attempt.id)).toEqual({ outcome: "failed", attemptId: attempt.id });
  expect(repository.store).not.toHaveBeenCalled();
});

it.each(["owner", "fence", "attempt"])("refuses mismatched %s claim authority before document I/O or writes", async (kind) => {
  const { worker, attempt, repository, createOrRead } = setup();
  vi.mocked(repository.claim).mockImplementation(async (_id, owner) => ({ ...attempt, leaseOwner: kind === "owner" ? randomUUID() : owner,
    fence: kind === "fence" ? 9007199254740993 as unknown as string : attempt.fence, id: kind === "attempt" ? randomUUID() : attempt.id }));
  expect(await worker.run(attempt.id)).toMatchObject({ outcome: "lease_lost" });
  expect(createOrRead).not.toHaveBeenCalled();
  expect(repository.store).not.toHaveBeenCalled();
  expect(repository.finalize).not.toHaveBeenCalled();
  expect(repository.fail).not.toHaveBeenCalled();
});

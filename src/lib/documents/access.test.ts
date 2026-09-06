// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import { createKeyedTokenCodec } from "../security/keyed-token";
import { createDocumentRepository } from "../db/documents";
import type { DocumentAccessConfig, InvoiceAccessCandidate, InvoiceAccessTarget } from "./contracts";
import { createInvoiceAccessService } from "./access";

const id = "00000000-0000-4000-8000-000000000001";
const config: DocumentAccessConfig = {
  appOrigin: "https://example.test", explorerOrigin: "https://explorer.test",
  keys: new Map([[1, new Uint8Array(32).fill(7)], [2, new Uint8Array(32).fill(8)]]),
  pepper: new Uint8Array(32).fill(9),
};

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-02T00:00:00.000Z"));
  const token = createKeyedTokenCodec(config.keys).derive(id, "invoice-bearer", 1);
  const candidate: InvoiceAccessCandidate = {
    tokenId: id, keyVersion: 1, verifierHash: token.verifierHash, purpose: "invoice-bearer",
    workspaceId: "00000000-0000-4000-8000-000000000002", invoiceId: id, invoiceVersionId: id,
    activatedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z", revokedAt: null,
  };
  const { purpose: _purpose, workspaceId, invoiceId, invoiceVersionId, ...link } = candidate;
  const snapshot = testPublicationSnapshot();
  const hash = `0x${"3".repeat(64)}` as const;
  const target: InvoiceAccessTarget = {
    invoiceId, invoiceVersion: 1, invoiceNumber: "INV-2030-000001", commercialState: "published",
    payableUntil: snapshot.payableUntil, voidedAt: null, snapshot, settlement: null, receipt: null, deliveries: [],
    attempt: {
      id, workspaceId, invoiceId, invoiceVersionId, invoiceVersion: 1, invoiceNumber: "INV-2030-000001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: `0x${"4".repeat(40)}`,
      invoiceKey: hash, publicationSalt: hash, storageKey: "private/immutable.pdf", link,
      leaseOwner: null, leaseUntil: null, fence: "1", failureCode: null, finalizedAt: "2030-01-01T00:00:00.000Z",
      artifact: { pdfFilename: "INV-2030-000001.pdf", contentType: "application/pdf", byteLength: 100,
        invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true },
    },
  };
  const repository = {
    findCandidate: vi.fn().mockResolvedValue(candidate), readTarget: vi.fn().mockResolvedValue(target),
    admit: vi.fn().mockResolvedValue({ allowed: true }), storageState: vi.fn(),
  };
  return { candidate, target, repository, slug: token.slug, service: createInvoiceAccessService(repository, config) };
}

afterEach(() => vi.useRealTimers());

it("uses retained stored keys and reads only the verified token's exact target without recounting", async () => {
  const { service, target, repository, slug } = setup();
  expect(await service.resolve(slug)).toBe(target);
  expect(repository.readTarget).toHaveBeenCalledExactlyOnceWith(id);
  expect(repository.admit).not.toHaveBeenCalled();
});

it.each([
  { activatedAt: null }, { activatedAt: "2030-01-02T00:00:00.001Z" }, { activatedAt: "invalid" },
  { expiresAt: "2030-01-02T00:00:00.000Z" }, { expiresAt: "invalid" },
  { revokedAt: "2030-01-01T00:00:00.000Z" }, { purpose: "receipt-bearer" as const },
  { keyVersion: 3 }, { verifierHash: "0".repeat(64) }, { tokenId: "another-token" },
])("denies inactive, expired, revoked, wrong-purpose and unverifiable metadata before target reads (%j)", async (change) => {
  const { service, candidate, repository, slug } = setup();
  Object.assign(candidate, change);
  expect(await service.resolve(slug)).toBeNull();
  expect(repository.readTarget).not.toHaveBeenCalled();
});

it.each(["", "random", "invalid.slug", "padded", "wrong-mac"])("denies noncanonical or forged credentials (%s)", async (kind) => {
  const { service, slug, repository } = setup();
  const supplied = kind === "padded" ? `${slug}=` : kind === "wrong-mac" ? `${slug.slice(0, 23)}${"A".repeat(43)}` : kind;
  expect(await service.resolve(supplied)).toBeNull();
  expect(repository.readTarget).not.toHaveBeenCalled();
});

it.each([
  "11111111-1111-1111-1111-111111111111",
  "01ffffff-ffff-ffff-ffff-ffffffffffff",
  "00000000-0000-0000-8000-000000000001",
  "00000000-0000-9000-8000-000000000001",
  "00000000-0000-4000-7000-000000000001",
])("denies canonical bearer bytes with a database-ineligible UUID before candidate validation (%s)", async (tokenId) => {
  const { service, repository } = setup();
  const codec = createKeyedTokenCodec(config.keys);
  const { slug } = codec.derive(tokenId, "invoice-bearer", 1);
  expect(codec.parseTokenId(slug)).toBe(tokenId);
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  repository.findCandidate.mockImplementation(createDocumentRepository({ rpc }).findCandidate);
  expect(await service.resolve(slug, "192.0.2.1")).toBeNull();
  expect(repository.admit.mock.calls.map(([scope]) => scope)).toEqual(["ip"]);
  expect(repository.findCandidate).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  "workspaceId", "invoiceId", "invoiceVersionId", "invoiceVersion", "invoiceNumber", "state", "finalizedAt", "artifact",
  "tokenId", "keyVersion", "verifierHash", "activatedAt", "expiresAt", "revokedAt", "topInvoice", "topVersion", "topNumber", "void", "draft",
])("rechecks the exact admitted target and link metadata (%s)", async (field) => {
  const { service, target, slug } = setup();
  if (["tokenId", "keyVersion", "verifierHash", "activatedAt", "expiresAt", "revokedAt"].includes(field)) {
    Object.assign(target.attempt.link, { [field]: field === "keyVersion" ? 2 : "2030-01-01T00:00:01.000Z" });
  } else if (field === "topInvoice") target.invoiceId = "different";
  else if (field === "topVersion") target.invoiceVersion = 2;
  else if (field === "topNumber") target.invoiceNumber = "different";
  else if (field === "void") target.commercialState = "voided";
  else if (field === "draft") target.commercialState = "draft";
  else Object.assign(target.attempt, { [field]: field === "invoiceVersion" ? 2 : ["finalizedAt", "artifact"].includes(field) ? null : "different" });
  expect(await service.resolve(slug)).toBeNull();
});

it("keeps commercial expiry separate from credential expiry and rechecks link time after I/O", async () => {
  const { service, target, repository, slug } = setup();
  target.commercialState = "expired";
  expect(await service.resolve(slug)).toBe(target);
  repository.readTarget.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date(target.attempt.link.expiresAt));
    return target;
  });
  expect(await service.resolve(slug)).toBeNull();
});

it("returns null for disappeared targets and sanitizes operational exceptions without their cause", async () => {
  const { service, repository, slug } = setup();
  repository.readTarget.mockResolvedValueOnce(null);
  expect(await service.resolve(slug)).toBeNull();
  repository.findCandidate.mockRejectedValueOnce(new Error(`provider leaked ${slug}`));
  const error = await service.resolve(slug).catch((error: Error) => error);
  expect(error).toMatchObject({ message: "DOCUMENT_UNAVAILABLE" });
  expect(Object.hasOwn(error!, "cause")).toBe(false);
  expect(String(error).includes(slug)).toBe(false);
});

it("admits IP before even malformed lookups and admits tokens only after cryptographic verification", async () => {
  const { service, repository, slug } = setup();
  expect(await service.resolve("invalid", "192.0.2.1")).toBeNull();
  expect(repository.findCandidate).not.toHaveBeenCalled();
  expect(repository.admit.mock.calls.map(([scope]) => scope)).toEqual(["ip"]);
  repository.admit.mockClear();
  await service.resolve(slug, "192.0.2.1");
  expect(repository.admit.mock.calls.map(([scope]) => scope)).toEqual(["ip", "token"]);
  expect(repository.admit.mock.invocationCallOrder[0]).toBeLessThan(repository.findCandidate.mock.invocationCallOrder[0]);
  expect(repository.admit.mock.invocationCallOrder[1]).toBeLessThan(repository.readTarget.mock.invocationCallOrder[0]);
  for (const [, key] of repository.admit.mock.calls) {
    expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    expect(key.includes(id) || key.includes(slug) || key.includes("192.0.2.1")).toBe(false);
  }
});

it.each(["ip", "token"])("quota denial at %s returns null without reading document facts", async (scope) => {
  const { service, repository, slug } = setup();
  repository.admit.mockImplementation(async (value) => ({ allowed: value !== scope }));
  expect(await service.resolve(slug, "192.0.2.1")).toBeNull();
  expect(repository.readTarget).not.toHaveBeenCalled();
  if (scope === "ip") expect(repository.findCandidate).not.toHaveBeenCalled();
});

it("normalizes equivalent IPs, bounds invalid inputs to one bucket and separates token/IP hashes", async () => {
  const { service, repository, slug } = setup();
  for (const ip of ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1", "garbage", "192.0.2.1, 192.0.2.2", "x".repeat(500), id]) {
    await service.resolve(slug, ip);
  }
  const ips = repository.admit.mock.calls.filter(([scope]) => scope === "ip").map(([, key]) => key);
  expect(ips[0]).toBe(ips[1]);
  expect(new Set(ips.slice(2)).size).toBe(1);
  const tokens = repository.admit.mock.calls.filter(([scope]) => scope === "token").map(([, key]) => key);
  expect(new Set(tokens).size).toBe(1);
  expect(ips.includes(tokens[0])).toBe(false);
});

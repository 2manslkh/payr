import { expect, it, vi } from "vitest";
import { DocumentUnavailableError } from "../documents/contracts";
import { createDocumentRepository } from "./documents";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { InvoiceAccessTarget } from "../documents/contracts";

const id = "00000000-0000-4000-8000-000000000001";
const key = `workspace/${id}/invoice/${id}/1/attempt/${id}.pdf`;
const other = "00000000-0000-4000-8000-000000000002";
const hash = `0x${"1".repeat(64)}` as const;
const link = { tokenId: id, keyVersion: 1, verifierHash: "a".repeat(64), activatedAt: "2026-09-06T00:00:00.000Z",
  revokedAt: null, expiresAt: "2031-03-02T00:00:00.000Z" };
function target(): InvoiceAccessTarget {
  const snapshot = testPublicationSnapshot();
  return { invoiceId: id, invoiceVersion: 1, invoiceNumber: "INV-2026-000001", commercialState: "published",
    payableUntil: snapshot.payableUntil, voidedAt: null, snapshot: structuredClone(snapshot), settlement: null, receipt: null, deliveries: [],
    attempt: { id, workspaceId: id, invoiceId: id, invoiceVersionId: other, invoiceVersion: 1, invoiceNumber: "INV-2026-000001",
      state: "finalized", snapshot, chainId: 5042002, contractAddress: `0x${"3".repeat(40)}`, invoiceKey: hash,
      publicationSalt: hash, storageKey: key, link, leaseOwner: other, leaseUntil: "2026-09-06T00:01:00.000Z", fence: "1",
      failureCode: null, finalizedAt: link.activatedAt, artifact: { pdfFilename: "INV-2026-000001.pdf", contentType: "application/pdf",
        byteLength: 100, invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true } } };
}
function repository(data: unknown) { return createDocumentRepository({ rpc: async () => ({ data, error: null }) }); }

it("uses only the four frozen service RPCs, without an owner actor", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: "stored", error: null }).mockResolvedValueOnce({ data: { allowed: false }, error: null });
  const repository = createDocumentRepository({ rpc });
  expect(await repository.findCandidate(id)).toBeNull();
  expect(await repository.readTarget(id)).toBeNull();
  expect(await repository.storageState(key)).toBe("stored");
  expect(await repository.admit("ip", "a".repeat(64))).toEqual({ allowed: false });
  expect(rpc.mock.calls).toEqual([
    ["payr_find_invoice_access_candidate_v1", { p_token_id: id }],
    ["payr_read_invoice_document_v1", { p_token_id: id }],
    ["payr_document_storage_state_v1", { p_storage_key: key }],
    ["payr_admit_document_access_v1", { p_scope: "ip", p_key_hash: "a".repeat(64) }],
  ]);
});

it("sanitizes transport failures and malformed admission replies", async () => {
  for (const rpc of [vi.fn().mockRejectedValue(new Error("private provider detail")),
    vi.fn().mockResolvedValue({ data: null, error: { message: "private provider detail" } }),
    vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 50 }, error: null })]) {
    await expect(createDocumentRepository({ rpc }).admit("token", "a".repeat(64))).rejects.toEqual(new DocumentUnavailableError());
  }
});

it("validates metadata-only candidates, preserving wrong purpose for credential rejection", async () => {
  const candidate = { ...link, purpose: "invoice-bearer", workspaceId: id, invoiceId: id, invoiceVersionId: other };
  expect(await repository(candidate).findCandidate(id)).toEqual(candidate);
  expect(await repository({ ...candidate, purpose: "receipt-bearer" }).findCandidate(id)).toMatchObject({ purpose: "receipt-bearer" });
  for (const data of [{ ...candidate, snapshot: testPublicationSnapshot() }, { ...candidate, tokenId: other },
    { ...candidate, keyVersion: "1" }, { ...candidate, verifierHash: "A".repeat(64) }, { ...candidate, purpose: "future" },
    { ...candidate, expiresAt: "infinity" }, { ...candidate, workspaceId: "not a UUID" }, [], undefined]) {
    await expect(repository(data).findCandidate(id)).rejects.toEqual(new DocumentUnavailableError());
  }
});

it("returns the existing status DTO with a nonnull finalized attempt and exact snapshot", async () => {
  expect(await repository(target()).readTarget(id)).toEqual(target());
  expect(await repository({ ...target(), commercialState: "expired" }).readTarget(id)).toMatchObject({ commercialState: "expired" });
});

it.each([Date.parse(link.activatedAt) - 1, Date.parse(link.expiresAt)])(
  "decodes consistent timestamps independently of application clock %s", async (now) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      // SQL admission and the access service enforce time; transit cannot corrupt a DTO.
      expect(await repository(target()).readTarget(id)).toEqual(target());
    } finally { clock.mockRestore(); }
  },
);

it.each([
  ["attempt", null], ["snapshot", null], ["invoiceVersion", 2], ["invoiceNumber", "INV-2026-000002"],
  ["commercialState", "draft"], ["commercialState", "voided"], ["payableUntil", "2031-01-01T00:00:00.000Z"],
  ["snapshot.memo", "different frozen snapshot"], ["attempt.invoiceId", other], ["attempt.invoiceVersion", 2],
  ["attempt.link.tokenId", other], ["attempt.link.revokedAt", "2026-09-06T00:00:00.000Z"],
  ["attempt.link.activatedAt", null], ["attempt.artifact", null], ["attempt.fence", "01"],
  ["attempt.link.expiresAt", "2000-01-01T00:00:00.000Z"], ["attempt.link.activatedAt", "2099-01-01T00:00:00.000Z"],
  ["attempt.artifact.qrVerified", false], ["attempt.snapshot.items.0.amountAtomic", "123"], ["invoiceUrl", "private"],
])("rejects inconsistent target field %s", async (path, replacement) => {
  const value = structuredClone(target()), keys = String(path).split(".");
  let object: object = value;
  for (const key of keys.slice(0, -1)) object = Reflect.get(object, key);
  Reflect.set(object, keys.at(-1)!, replacement);
  await expect(repository(value).readTarget(id)).rejects.toEqual(new DocumentUnavailableError());
});

it("validates settlement, receipt and delivery consistency against the exact frozen invoice", async () => {
  const value = target();
  value.settlement = { chainId: value.attempt.chainId, contractAddress: value.attempt.contractAddress, invoiceVersion: 1,
    transactionHash: hash, logIndex: 0, blockNumber: "9007199254740993", blockTime: "2026-09-06T00:00:00.000Z",
    payer: `0x${"4".repeat(40)}`, payee: value.attempt.snapshot.sender.payoutWallet as `0x${string}`, amountDecimal: "1.23",
    amountAtomic: "1230000000000000000", documentCommitment: hash };
  value.receipt = { state: "pending", link: { ...link, tokenId: other, activatedAt: null }, artifact: null };
  value.deliveries = [{ roles: ["client"], normalizedRecipient: "client@example.test", state: "pending",
    providerMessageId: null, attemptCount: 0, nextAttemptAt: null }];
  expect(await repository(value).readTarget(id)).toEqual(value);
  for (const bad of [{ ...value, settlement: null }, { ...value, receipt: null },
    { ...value, settlement: { ...value.settlement, chainId: 1 } },
    { ...value, settlement: { ...value.settlement, documentCommitment: `0x${"2".repeat(64)}` } },
    { ...value, settlement: { ...value.settlement, payee: `0x${"4".repeat(40)}` } },
    { ...value, receipt: { ...value.receipt, state: "ready" } },
    { ...value, deliveries: [...value.deliveries, ...value.deliveries] },
    { ...value, deliveries: [{ ...value.deliveries[0], normalizedRecipient: "wrong@example.test" }] }]) {
    await expect(repository(bad).readTarget(id)).rejects.toEqual(new DocumentUnavailableError());
  }
});

it("rejects malformed inputs before RPC and unknown state outputs without coercion", async () => {
  const rpc = vi.fn(), db = createDocumentRepository({ rpc });
  await expect(db.findCandidate("not-a-uuid")).rejects.toEqual(new DocumentUnavailableError());
  await expect(db.readTarget("not-a-uuid")).rejects.toEqual(new DocumentUnavailableError());
  for (const path of ["../invoice.pdf", key + "?secret", key.replace("/1/", "/01/"), key.replace("/1/", "/2147483648/")]) {
    await expect(db.storageState(path)).rejects.toEqual(new DocumentUnavailableError());
  }
  for (const [scope, keyHash] of [["global", "a".repeat(64)], ["ip", "127.0.0.1"], ["token", "A".repeat(64)], ["ip", "a".repeat(65)]]) {
    await expect(db.admit(scope as "ip", keyHash)).rejects.toEqual(new DocumentUnavailableError());
  }
  expect(rpc).not.toHaveBeenCalled();
  for (const state of ["future", {}, ["stored"], 1, undefined]) await expect(repository(state).storageState(key)).rejects.toEqual(new DocumentUnavailableError());
});

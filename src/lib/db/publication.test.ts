import { expect, it } from "vitest";
import type { PublicationAttempt, PublicationReservation } from "../invoices/publication-contracts";
import { testPublicationSnapshot } from "../invoices/publication.test-support";
import type { RpcClient } from "./repositories";
import { createPublicationRepository } from "./publication";

const id = "00000000-0000-4000-8000-000000000001";
const worker = "00000000-0000-4000-8000-000000000002";
const hash = `0x${"1".repeat(64)}` as const;
const wallet = `0x${"2".repeat(40)}` as const;
const actor = { workspaceId: id, ownerWallet: wallet, connectorId: null };
const fence = { attemptId: id, leaseOwner: worker, fence: "9007199254740993" };
const artifact = { pdfFilename: "INV-2026-000001.pdf", contentType: "application/pdf" as const, byteLength: 123,
  invoiceDataHash: hash, pdfContentHash: hash, documentCommitment: hash, qrVerified: true as const };
const input: PublicationReservation = { draftId: id, expectedVersion: 1, approval: true, idempotencyKey: "publish-key",
  requestFingerprint: "1".repeat(64), attemptId: id, invoiceKey: hash, publicationSalt: hash, tokenId: id, keyVersion: 1,
  verifierHash: "2".repeat(64), chainId: 5042002, contractAddress: wallet };
function attempt(): PublicationAttempt {
  return { id, workspaceId: id, invoiceId: id, invoiceVersionId: id, invoiceVersion: 1, invoiceNumber: "INV-2026-000001",
    state: "reserved", snapshot: testPublicationSnapshot(), chainId: input.chainId, contractAddress: wallet, invoiceKey: hash,
    publicationSalt: hash, storageKey: `workspace/${id}/invoice/${id}/1/attempt/${id}.pdf`,
    link: { tokenId: id, keyVersion: 1, verifierHash: "2".repeat(64), expiresAt: "2031-03-02T00:00:00.000Z", activatedAt: null, revokedAt: null },
    leaseOwner: null, leaseUntil: "2026-09-06T00:00:00.000Z", fence: "0", artifact: null, failureCode: null, finalizedAt: null };
}
function repository(data: unknown, error: Awaited<ReturnType<RpcClient["rpc"]>>["error"] = null) {
  return createPublicationRepository({ rpc: () => Promise.resolve({ data, error }) });
}
function altered(value: unknown, path: string, replacement: unknown, remove = false): unknown {
  const result = structuredClone(value);
  const keys = path.split("."); let target = result as object;
  for (const key of keys.slice(0, -1)) target = Reflect.get(target, key);
  if (remove) Reflect.deleteProperty(target, keys.at(-1)!); else Reflect.set(target, keys.at(-1)!, replacement);
  return result;
}

it("claims with platform worker identity rather than a fabricated owner", async () => {
  const calls: unknown[] = [];
  const repository = createPublicationRepository({ rpc(name, parameters) {
    calls.push({ name, parameters }); return Promise.resolve({ data: null, error: null });
  } });
  await expect(repository.claim(null, "00000000-0000-4000-8000-000000000001")).resolves.toBeNull();
  expect(calls).toEqual([{ name: "payr_claim_publication_v1", parameters: { p_attempt_id: null, p_lease_owner: "00000000-0000-4000-8000-000000000001" } }]);
});

it("pins all eight RPC names, actor fields, JSON arguments and text fences", async () => {
  const calls: { name: string; parameters: Record<string, unknown> }[] = [];
  const reserved = attempt(), stored = { ...reserved, state: "stored" as const, leaseOwner: worker, fence: fence.fence, artifact };
  const finalized = { ...stored, state: "finalized" as const, finalizedAt: "2026-09-06T00:00:00.000Z",
    link: { ...stored.link, activatedAt: "2026-09-06T00:00:00.000Z" } };
  const failed = { ...stored, state: "failed" as const, failureCode: "PROFILE_CONFLICT" as const,
    link: { ...stored.link, revokedAt: "2026-09-06T00:00:00.000Z" } };
  const result = { invoiceId: id, invoiceVersion: 1, commercialState: "voided", voidedAt: "2026-09-06T00:00:00.000Z" };
  const responses = [reserved, null, stored, finalized, failed, null, result, { expired: 3 }];
  const db = createPublicationRepository({ rpc(name, parameters) { calls.push({ name, parameters }); return Promise.resolve({ data: responses.shift(), error: null }); } });
  const voidWrite = { invoiceId: id, expectedVersion: 1, approval: true as const, idempotencyKey: "void-key", requestFingerprint: "3".repeat(64) };
  expect(await db.reserve(actor, input)).toEqual(reserved);
  expect(await db.claim(null, worker)).toBeNull();
  expect(await db.store({ ...fence, artifact })).toEqual(stored);
  expect(await db.finalize(fence)).toEqual(finalized);
  expect(await db.fail({ ...fence, failureCode: "PROFILE_CONFLICT" })).toEqual(failed);
  expect(await db.statusData(actor, id)).toBeNull();
  expect(await db.voidInvoice(actor, voidWrite)).toEqual(result);
  expect(await db.expire(3)).toEqual({ expired: 3 });
  const scope = { p_workspace_id: id, p_owner_wallet: wallet, p_connector_id: null };
  const args = { p_attempt_id: id, p_lease_owner: worker, p_fence: fence.fence };
  expect(calls).toEqual([
    { name: "payr_reserve_publication_v1", parameters: { ...scope, p_input: input } },
    { name: "payr_claim_publication_v1", parameters: { p_attempt_id: null, p_lease_owner: worker } },
    { name: "payr_store_publication_v1", parameters: { ...args, p_artifact: artifact } },
    { name: "payr_finalize_publication_v1", parameters: args },
    { name: "payr_fail_publication_v1", parameters: { ...args, p_failure_code: "PROFILE_CONFLICT" } },
    { name: "payr_publication_status_v1", parameters: { ...scope, p_invoice_id: id } },
    { name: "payr_void_invoice_v1", parameters: { ...scope, p_input: voidWrite } },
    { name: "payr_expire_invoices_v1", parameters: { p_limit: 3 } },
  ]);
});

it.each(["-1", "01", "1.5", "1e3", "9223372036854775808", "9".repeat(100), 1, 9007199254740992, null, undefined, true])(
  "rejects invalid bigint input %j before RPC", async (value) => {
    let called = false;
    const db = createPublicationRepository({ rpc: () => { called = true; return Promise.resolve({ data: null, error: null }); } });
    await expect(db.finalize({ ...fence, fence: value } as never)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(called).toBe(false);
  },
);

it.each([null, [], [attempt()], {}, "secret", 1, true, undefined])("rejects non-object or null reserve result %j", async (value) => {
  await expect(repository(value).reserve(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", status: 500 });
});

it.each([
  ["fence", 1], ["fence", "01"], ["fence", "9223372036854775808"], ["invoiceVersion", "1"], ["chainId", "5042002"],
  ["chainId", Number.MAX_SAFE_INTEGER + 1], ["contractAddress", `0x${"0".repeat(40)}`], ["contractAddress", "not-an-address"],
  ["invoiceKey", "not-a-hash"], ["publicationSalt", "0x1234"], ["storageKey", "workspace/other.pdf"], ["state", "future"],
  ["failureCode", "private provider error"], ["link.activatedAt", "2026-09-06T00:00:00.000Z"], ["link.keyVersion", "1"],
  ["link.verifierHash", "A".repeat(64)], ["link.expiresAt", "infinity"], ["leaseOwner", "not-a-uuid"],
  ["snapshot.schemaVersion", "future"], ["snapshot.amountAtomic", "123"], ["snapshot.items.0.amountAtomic", "9000000"],
  ["snapshot.client.billingAddress.countryCode", "ZZ"], ["snapshot.client.businessName", " unnormalized "],
  ["snapshot.client.contactEmail", "CLIENT@example.test"], ["snapshot.sender.revision", "1"],
  ["snapshot.clientReference.revision", null], ["snapshot.proposedClientChanges.kind", "create"],
  ["snapshot.payableUntil", "2030-03-03T00:00:00.000Z"], ["snapshot.appliedDefaults", []], ["snapshot.dueDate", "2030-02-30"],
])("rejects malformed attempt field %s", async (path, value) => {
  await expect(repository(altered(attempt(), String(path), value)).reserve(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
});

it.each(["id", "workspaceId", "snapshot", "artifact", "failureCode", "finalizedAt", "link.revokedAt", "link.activatedAt", "leaseOwner", "leaseUntil"])(
  "requires explicit output field %s", async (path) => {
    await expect(repository(altered(attempt(), path, null, true)).reserve(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  },
);

it.each(["invoiceUrl", "paymentUrl", "signature", "decodedQrDestination", "providerError"])("rejects extra private output %s", async (field) => {
  await expect(repository({ ...attempt(), [field]: "secret" }).reserve(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
});

it.each([null, {}, { ...actor, connectorId: worker }, { ...actor, ownerWallet: null }, { ...actor, scope: "invoice:publish" }])(
  "strictly validates actor %j", async (value) => {
    await expect(repository(null).statusData(value as never, id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  },
);

it.each([false, "true", 1, null, undefined])("requires literal publish approval, not %j", async (approval) => {
  await expect(repository(attempt()).reserve(actor, { ...input, approval } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it.each([0, 101, 1.1, "1", null, undefined])("validates expiry input %j", async (limit) => {
  await expect(repository({ expired: 0 }).expire(limit as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it.each([null, 1, [{ expired: 1 }], { expired: "1" }, { expired: 4 }, { expired: -1 }, { expired: 1, secret: "no" }])(
  "rejects malformed expiry output %j", async (value) => {
    await expect(repository(value).expire(3)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  },
);

it.each(["store", "finalize", "fail"] as const)("maps stale %s responses to null, not invented success", async (method) => {
  const db = repository(null);
  expect(await (method === "store" ? db.store({ ...fence, artifact }) : method === "finalize" ? db.finalize(fence)
    : db.fail({ ...fence, failureCode: "PROFILE_CONFLICT" }))).toBeNull();
});

it("allows exact text fences above MAX_SAFE_INTEGER and rejects mismatched worker bindings", async () => {
  const claimed = { ...attempt(), state: "rendering", leaseOwner: worker, fence: fence.fence };
  expect(await repository(claimed).claim(id, worker)).toMatchObject({ fence: "9007199254740993" });
  await expect(repository(claimed).claim(id, id)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  await expect(repository({ ...claimed, state: "stored", artifact }).store({ ...fence, fence: "3", artifact }))
    .rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
});

it.each([
  { message: "secret SQL body", code: "P0001", details: "private" }, { message: "NOT_FOUND", code: "23505" },
  { message: "constructor", code: "P0001" }, { message: "VERSION_CONFLICT", code: "P0001", details: "private" },
  { message: "VERSION_CONFLICT", code: "P0001", details: JSON.stringify({ draftId: id, currentVersion: 2, private: "snapshot" }) },
])("sanitizes errors %j", async (error) => {
  await expect(repository(null, error).reserve(actor, input)).rejects.toMatchObject({ message: "DATABASE_ERROR", code: "DATABASE_ERROR", status: 500 });
});

it("retains only validated VERSION_CONFLICT details through DraftError", async () => {
  await expect(repository(null, { message: "VERSION_CONFLICT", code: "P0001", details: JSON.stringify({ draftId: id, currentVersion: 2 }) })
    .reserve(actor, input)).rejects.toMatchObject({ name: "DraftError", code: "VERSION_CONFLICT", details: { draftId: id, currentVersion: 2 } });
  await expect(repository(null, { message: "PROFILE_CONFLICT", code: "P0001", details: "secret" }).reserve(actor, input))
    .rejects.toMatchObject({ name: "PublicationError", message: "PROFILE_CONFLICT", status: 409 });
});

it.each([["CLIENT_CONFLICT", "PROFILE_CONFLICT", 409], ["DEADLINE_EXPIRED", "DRAFT_NOT_EDITABLE", 409],
  ["INVOICE_ALREADY_SETTLED", "INVOICE_NOT_VOIDABLE", 409], ["PUBLICATION_CONFIGURATION_REQUIRED", "CONFIGURATION_ERROR", 503],
  ["PUBLICATION_CONFLICT", "PUBLICATION_RETRYABLE", 503]])("maps SQL admission %s to the frozen HTTP code %s", async (sqlCode, code, status) => {
  await expect(repository(null, { code: "P0001", message: String(sqlCode), details: "private" }).reserve(actor, input))
    .rejects.toMatchObject({ code, status });
});

it("sanitizes transport exceptions", async () => {
  const db = createPublicationRepository({ rpc: () => { throw new Error("private provider response"); } });
  await expect(db.claim(null, worker)).rejects.toMatchObject({ message: "DATABASE_ERROR", status: 500 });
});

import { expect, it, vi } from "vitest";
import type { DraftWrite, InvoiceActor, InvoiceQuery } from "../invoices/contracts";
import { createDraftRepository } from "./drafts";

const actor: InvoiceActor = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null };
const fingerprint = "a".repeat(64);
function draftWrite(): DraftWrite {
  const billingAddress = { line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB" };
  return { draftId: null, expectedVersion: null, idempotencyKey: "key", requestFingerprint: fingerprint, snapshot: {
    schemaVersion: "payr.draft.v1", sender: { id: actor.workspaceId, revision: 1, businessName: "Studio", billingAddress,
      contactName: "Owner", contactEmail: "owner@example.test", payoutWallet: actor.ownerWallet!, invoicePrefix: "PAYR", defaultPaymentTermsDays: null },
    client: { businessName: "Client", billingAddress, contactName: "Contact", contactEmail: "client@example.test" },
    clientReference: { id: actor.workspaceId, alias: "client", revision: 1 },
    clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "saved_profile" }, contactEmail: { kind: "saved_profile" } },
    proposedClientChanges: { kind: "none", fields: {} },
    items: [{ description: "Consulting", amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001" }],
    issueDate: "2026-09-06", dueDate: "2026-09-06", payableUntil: "2026-10-06T00:00:00.000Z",
    amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001", memo: "",
    appliedDefaults: [{ field: "payableUntil", value: "2026-10-06T00:00:00.000Z", source: "technical_deadline" }],
  } };
}

it("scopes replay reads to the verified owner or connector instead of inventing an owner session", async () => {
  const calls: unknown[] = [];
  const repository = createDraftRepository({ rpc(name, parameters) {
    calls.push({ name, parameters });
    return Promise.resolve({ data: null, error: null });
  } });
  await expect(repository.findReplay({
    workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: null,
    connectorId: "00000000-0000-4000-8000-000000000002",
  }, "request-1", "a".repeat(64))).resolves.toBeNull();
  expect(calls).toEqual([{
    name: "payr_find_draft_replay_v1",
    parameters: {
      p_workspace_id: "00000000-0000-4000-8000-000000000001", p_owner_wallet: null,
      p_connector_id: "00000000-0000-4000-8000-000000000002", p_idempotency_key: "request-1", p_request_fingerprint: "a".repeat(64),
    },
  }]);
});

it.each([
  { ...actor, connectorId: actor.workspaceId }, { ...actor, ownerWallet: null },
  { ...actor, workspaceId: "foreign" }, { ...actor, ownerWallet: "owner" }, { ...actor, bearer: "secret" },
])("rejects invalid actors before RPC", async (value) => {
  const rpc = vi.fn();
  await expect(createDraftRepository({ rpc }).findReplay(value, "key", fingerprint)).rejects.toMatchObject({ code: "INVALID_INPUT", details: {} });
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["", " ", " key", "x".repeat(129)])("validates replay keys locally: %s", async (key) => {
  const rpc = vi.fn();
  await expect(createDraftRepository({ rpc }).findReplay(actor, key, fingerprint)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["", "A".repeat(64), "a".repeat(63), "g".repeat(64), fingerprint + "\n"])("validates fingerprints locally: %s", async (value) => {
  const rpc = vi.fn();
  await expect(createDraftRepository({ rpc }).findReplay(actor, "key", value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each([{}, { snapshot: {} }, { snapshot: { amountAtomic: "NaN" } }])("rejects incomplete write structures without calling SQL", async (value) => {
  const rpc = vi.fn();
  await expect(createDraftRepository({ rpc }).saveDraft(actor, value as DraftWrite)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each([{ limit: 51 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }, { commercialState: "paid" }, { search: "x".repeat(201) }, { private: true }])(
  "rejects invalid projection queries", async (changes) => {
    const rpc = vi.fn();
    const query = { search: "", commercialState: null, limit: 50, offset: 0, ...changes } as InvoiceQuery;
    await expect(createDraftRepository({ rpc }).listInvoices(actor, query)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

it.each(["NOT_FOUND", "INVALID_INPUT", "PROFILE_CONFLICT", "IDEMPOTENCY_CONFLICT", "DRAFT_NOT_EDITABLE"])(
  "returns only the allowlisted %s code and discards provider detail", async (message) => {
    const repository = createDraftRepository({ rpc: () => Promise.resolve({ data: { secret: true }, error: {
      code: "P0001", message, details: '{"token":"private"}',
    } }) });
    await expect(repository.findReplay(actor, "key", fingerprint)).rejects.toMatchObject({ code: message, details: {} });
  },
);

it("returns exactly the validated VERSION_CONFLICT detail", async () => {
  const details = { draftId: actor.workspaceId, currentVersion: 2 };
  const repository = createDraftRepository({ rpc: () => Promise.resolve({ data: null,
    error: { code: "P0001", message: "VERSION_CONFLICT", details: JSON.stringify(details) } }) });
  await expect(repository.findReplay(actor, "key", fingerprint)).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409, details });
});

it.each(["secret", "null", "{}", '{"draftId":"secret","currentVersion":1}',
  JSON.stringify({ draftId: actor.workspaceId, currentVersion: "2" }),
  JSON.stringify({ draftId: actor.workspaceId, currentVersion: 2, token: "private" }),
  JSON.stringify({ draftId: actor.workspaceId, currentVersion: 2147483648 }),
])("discards malformed or extended conflict details", async (details) => {
  const repository = createDraftRepository({ rpc: () => Promise.resolve({ data: null,
    error: { code: "P0001", message: "VERSION_CONFLICT", details } }) });
  await expect(repository.findReplay(actor, "key", fingerprint)).rejects.toMatchObject({ code: "DATABASE_ERROR", status: 500, details: {} });
});

it.each([{ code: "23514", message: "NOT_FOUND" }, { code: "P0001", message: "provider private payload" },
  { code: "P0001", message: "constructor" }])("does not expose unknown SQL errors", async (error) => {
  const repository = createDraftRepository({ rpc: () => Promise.resolve({ data: null, error }) });
  await expect(repository.findReplay(actor, "key", fingerprint)).rejects.toMatchObject({ code: "DATABASE_ERROR", details: {} });
});

it("discards rejected provider exceptions", async () => {
  const repository = createDraftRepository({ rpc: () => Promise.reject(new Error("private SQL")) });
  await expect(repository.findReplay(actor, "key", fingerprint)).rejects.toMatchObject({ code: "DATABASE_ERROR", details: {} });
});

it("validates the result of every RPC instead of casting provider data", async () => {
  const repository = createDraftRepository({ rpc: () => Promise.resolve({ data: { token: "private" }, error: null }) });
  for (const operation of [
    () => repository.findReplay(actor, "key", fingerprint),
    () => repository.getContext(actor, { draftId: null, clientId: null, clientAlias: null }),
    () => repository.listInvoices(actor, { search: "", commercialState: null, limit: 50, offset: 0 }),
    () => repository.getInvoiceDetail(actor, actor.workspaceId), () => repository.getOverview(actor),
  ]) await expect(operation()).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", details: {} });
});

it("passes exact context/list/detail/overview RPC parameters with the real actor", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const repository = createDraftRepository({ rpc });
  await repository.getContext(actor, { draftId: null, clientId: actor.workspaceId, clientAlias: "CaseSensitive" }).catch(() => {});
  await repository.listInvoices(actor, { search: "Client", commercialState: "expired", limit: 10, offset: 20 }).catch(() => {});
  await repository.getInvoiceDetail(actor, actor.workspaceId);
  await repository.getOverview(actor).catch(() => {});
  const scope = { p_workspace_id: actor.workspaceId, p_owner_wallet: actor.ownerWallet, p_connector_id: null };
  expect(rpc.mock.calls).toEqual([
    ["payr_get_draft_context_v1", { ...scope, p_draft_id: null, p_client_id: actor.workspaceId, p_client_alias: "CaseSensitive" }],
    ["payr_list_invoices_v1", { ...scope, p_search: "Client", p_commercial_state: "expired", p_limit: 10, p_offset: 20 }],
    ["payr_get_invoice_detail_v1", { ...scope, p_invoice_id: actor.workspaceId }], ["payr_get_invoice_overview_v1", scope],
  ]);
});

it("transports a complete write and validated immutable result without rounding amounts or timestamps", async () => {
  const input = draftWrite();
  const data = { id: actor.workspaceId, draftId: actor.workspaceId, version: 1, snapshot: input.snapshot, createdAt: "2026-09-06T01:02:03.123456+00:00" };
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  expect(await createDraftRepository({ rpc }).saveDraft(actor, input)).toEqual(data);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_save_invoice_draft_v1", { p_workspace_id: actor.workspaceId,
    p_owner_wallet: actor.ownerWallet, p_connector_id: null, p_input: input });
});

it.each([
  ["amountAtomic", 1000000000000000001], ["amountAtomic", "NaN"], ["amountAtomic", "0"], ["amountAtomic", "2"],
  ["amountDecimal", "1e2"], ["amountDecimal", "1.0"], ["amountDecimal", "-1"], ["issueDate", "2026-02-30"],
  ["dueDate", "9999-12-31"], ["payableUntil", "2026-10-06T00:00:01.000Z"], ["appliedDefaults", []],
  ["appliedDefaults", [...draftWrite().snapshot.appliedDefaults, { field: "dueDate", value: "2026-09-06", source: "sender_terms" }]],
  ["proposedClientChanges", { kind: "none", fields: { contactEmail: { value: "client@example.test", confirmed: false } } }],
  ["clientProvenance", { secret: true }], ["private", "bearer"],
])("validates snapshot %s on both input and provider output", async (key, value) => {
  const input = draftWrite();
  const invalid = { ...input.snapshot, [String(key)]: value };
  const rpc = vi.fn().mockResolvedValue({ data: { id: actor.workspaceId, draftId: actor.workspaceId,
    version: 1, snapshot: invalid, createdAt: "2026-09-06T00:00:00Z" }, error: null });
  const repository = createDraftRepository({ rpc });
  await expect(repository.saveDraft(actor, { ...input, snapshot: invalid })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rpc).not.toHaveBeenCalled();
  await expect(repository.saveDraft(actor, input)).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE", details: {} });
});

it.each([{ paymentStatus: "confirmed" }, { commercialState: "paid" }, { displayStatus: "Paid" },
  { amountAtomic: 1000000000000000001 }, { amountAtomic: "NaN" }, { amountDecimal: null }, { tokenHash: "private" }])(
  "validates exact projection enums, monetary pairs, and unknown fields", async (changes) => {
    const data = { items: [{ id: actor.workspaceId, invoiceNumber: null, version: 1, clientName: "Client",
      amountDecimal: "1.000000000000000001", amountAtomic: "1000000000000000001", issueDate: null, dueDate: null,
      payableUntil: null, commercialState: "draft", paymentStatus: "unpaid", displayStatus: "Draft", updatedAt: "2026-09-06T00:00:00Z", ...changes }], hasMore: false };
    const repository = createDraftRepository({ rpc: () => Promise.resolve({ data, error: null }) });
    await expect(repository.listInvoices(actor, { search: "", commercialState: null, limit: 50, offset: 0 })).rejects.toMatchObject({ code: "INVALID_DATABASE_RESPONSE" });
  },
);

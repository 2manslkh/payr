import { expect, it, vi } from "vitest";
import type { ClientProfile, SenderProfile } from "../identity/contracts";
import type { DraftContext, DraftRepository, DraftVersion, InvoiceActor, ProposedClientFields } from "./contracts";
import { DraftError } from "./errors";
import { createInvoiceDraftService } from "./service";

const actor: InvoiceActor = {
  workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null,
};
const draftId = "00000000-0000-4000-8000-000000000002";
const clientId = "00000000-0000-4000-8000-000000000003";
const address = { line1: "1 Main St", city: "London", postalCode: "SW1A 1AA", countryCode: "GB" };
const sender: SenderProfile = {
  id: actor.workspaceId, revision: 1, businessName: "Sender Studio", billingAddress: address,
  contactName: "Owner", contactEmail: "owner@example.com", payoutWallet: actor.ownerWallet!,
  invoicePrefix: "INV", defaultPaymentTermsDays: 14,
};
const client: ClientProfile = {
  id: clientId, revision: 1, alias: "Studio", businessName: "Client Studio", billingAddress: address,
  contactName: "Client", contactEmail: "client@example.com", provenance: {},
};
const input = {
  idempotencyKey: "request-1", client: { id: clientId }, useDefaultTerms: true,
  items: [{ description: "Design", amount: "1.2300" }, { description: "Review", amount: "0.000000000000000001" }],
};
const proposed: ProposedClientFields = {
  businessName: { value: "New Studio", confirmed: true, provenance: { kind: "user_provided" } },
  billingAddress: { value: address, confirmed: true, provenance: { kind: "user_provided" } },
  contactName: { value: "New Client", confirmed: true, provenance: { kind: "user_provided" } },
  contactEmail: { value: "new@example.com", confirmed: true, provenance: { kind: "web_source", url: "https://example.com/contact" } },
};

function setup() {
  const context: DraftContext = { sender: structuredClone(sender), client: structuredClone(client), previous: null, commercialState: null };
  const replays = new Map<string, { fingerprint: string; version: DraftVersion }>();
  const findReplay = vi.fn<DraftRepository["findReplay"]>(async (actor, key, fingerprint) => {
    const replay = replays.get(`${actor.workspaceId}:${key}`);
    if (replay && replay.fingerprint !== fingerprint) throw new DraftError("IDEMPOTENCY_CONFLICT", 409);
    return replay ? structuredClone(replay.version) : null;
  });
  const repository: DraftRepository = {
    findReplay,
    getContext: vi.fn(async () => structuredClone(context)),
    saveDraft: vi.fn(async (actor, write) => {
      const replay = await findReplay(actor, write.idempotencyKey, write.requestFingerprint);
      if (replay) return replay;
      if (write.draftId && context.previous?.version !== write.expectedVersion) {
        throw new DraftError("VERSION_CONFLICT", 409, { draftId, currentVersion: context.previous!.version });
      }
      const version: DraftVersion = {
        id: "00000000-0000-4000-8000-000000000004", draftId, version: (write.expectedVersion ?? 0) + 1,
        snapshot: structuredClone(write.snapshot), createdAt: "2026-09-06T00:00:00.000Z",
      };
      replays.set(`${actor.workspaceId}:${write.idempotencyKey}`, { fingerprint: write.requestFingerprint, version });
      context.previous = version;
      context.commercialState = "draft";
      return structuredClone(version);
    }),
    listInvoices: vi.fn(), getInvoiceDetail: vi.fn(), getOverview: vi.fn(),
  };
  const now = vi.fn(() => new Date("2026-09-06T00:30:00.000Z"));
  return { context, repository, now, service: createInvoiceDraftService(repository, now) };
}

it("reports structured omissions without reserving an idempotency key or creating a draft", async () => {
  const saveDraft = vi.fn();
  const repository = {
    findReplay: vi.fn().mockResolvedValue(null),
    getContext: vi.fn().mockResolvedValue({ sender: null, client: null, previous: null, commercialState: null }),
    saveDraft,
  } as unknown as DraftRepository;
  await expect(createInvoiceDraftService(repository).createDraft({
    workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null,
  }, { idempotencyKey: "missing-fields" })).rejects.toMatchObject({
    code: "MISSING_FIELDS", status: 422,
    details: { missingFields: expect.arrayContaining([{ path: "items", reason: "required" }]) },
  });
  expect(saveDraft).not.toHaveBeenCalled();
});

it("builds a complete authoritative snapshot with exact amounts and visible UTC defaults", async () => {
  const { service, repository } = setup();
  const result = await service.createDraft(actor, input);
  expect(result).toMatchObject({ code: "DRAFT_READY", draftCreated: true, draftId, version: 1 });
  expect(result.preview).toEqual({
    schemaVersion: "payr.draft.v1", sender,
    client: { businessName: client.businessName, billingAddress: address, contactName: client.contactName, contactEmail: client.contactEmail },
    clientReference: { id: clientId, alias: "Studio", revision: 1 },
    clientProvenance: Object.fromEntries(["businessName", "billingAddress", "contactName", "contactEmail"].map((field) => [field, { kind: "saved_profile" }])),
    proposedClientChanges: { kind: "none", fields: {} },
    items: [
      { description: "Design", amountDecimal: "1.23", amountAtomic: "1230000000000000000" },
      { description: "Review", amountDecimal: "0.000000000000000001", amountAtomic: "1" },
    ],
    issueDate: "2026-09-06", dueDate: "2026-09-20", payableUntil: "2026-10-20T00:00:00.000Z",
    amountDecimal: "1.230000000000000001", amountAtomic: "1230000000000000001", memo: "",
    appliedDefaults: [
      { field: "issueDate", value: "2026-09-06", source: "workspace_date" },
      { field: "dueDate", value: "2026-09-20", source: "sender_terms" },
      { field: "payableUntil", value: "2026-10-20T00:00:00.000Z", source: "technical_deadline" },
    ],
  });
  expect(JSON.parse(result.canonicalInvoiceJson)).toEqual(result.preview);
  expect(result.previewText).toContain("sender_terms");
  expect(result.previewText).toContain("saved_profile");
  expect(result.approvalInstruction).toContain(draftId);
  expect(result.approvalInstruction).toContain("version 1");
  expect(result.approvalInstruction).toContain("diff");
  expect(repository.saveDraft).toHaveBeenCalledOnce();
});

it.each([undefined, "New Studio"])("retains a complete confirmed proposal as a pending creation (alias %s)", async (alias) => {
  const { service, repository, context } = setup();
  context.client = null;
  const result = await service.createDraft(actor, { ...input, client: { ...(alias ? { alias } : {}), proposed } });
  expect(result.preview.client).toEqual({ businessName: "New Studio", billingAddress: address, contactName: "New Client", contactEmail: "new@example.com" });
  expect(result.preview.clientReference).toEqual({ id: null, alias: alias ?? null, revision: null });
  expect(result.preview.proposedClientChanges).toEqual({ kind: "create", fields: proposed });
  expect(result.preview.clientProvenance.contactEmail).toEqual(proposed.contactEmail!.provenance);
  expect(result.previewText).toContain("https://example.com/contact");
  expect(repository.saveDraft).toHaveBeenCalledOnce();
});

it("overlays saved client facts with only actual pending changes, retaining confirmation provenance", async () => {
  const { service } = setup();
  const changes = { contactEmail: proposed.contactEmail, businessName: { ...proposed.businessName!, value: client.businessName } };
  const result = await service.createDraft(actor, { ...input, client: { id: clientId, alias: " Studio ", proposed: changes } });
  expect(result.preview.client).toMatchObject({ businessName: "Client Studio", contactEmail: "new@example.com" });
  expect(result.preview.proposedClientChanges).toEqual({ kind: "update", fields: { contactEmail: proposed.contactEmail } });
  expect(result.preview.clientProvenance.businessName).toEqual({ kind: "user_provided" });
});

it("does not turn an unknown saved ID into a new client even with a complete proposal", async () => {
  const { service, repository, context } = setup();
  context.client = null;
  await expect(service.createDraft(actor, { ...input, client: { id: clientId, proposed } })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("requires simultaneous client selectors to match the same case-sensitive saved record", async () => {
  const { service, repository } = setup();
  await expect(service.createDraft(actor, { ...input, client: { id: clientId, alias: "studio" } })).rejects.toMatchObject({ code: "INVALID_INPUT", details: { fieldIssues: [{ path: "client", reason: "invalid_value" }] } });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("patches revision omissions, refreshes only the sender, replaces items, and clears an empty memo", async () => {
  const { service, context, now } = setup();
  const original = await service.createDraft(actor, { ...input, memo: "Keep until cleared" });
  context.sender = { ...sender, revision: 2, businessName: "Current Sender", defaultPaymentTermsDays: 0 };
  context.client = { ...client, revision: 2, businessName: "Changed outside draft" };
  now.mockReturnValue(new Date("2026-11-30T00:00:00Z"));
  const revision = await service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "revision", memo: "", items: [{ description: "Replacement", amount: "2" }] });
  expect(revision.version).toBe(2);
  expect(revision.preview.sender).toEqual(context.sender);
  expect(revision.preview.client).toEqual(original.preview.client);
  expect(revision.preview.clientReference).toEqual(original.preview.clientReference);
  expect(revision.preview).toMatchObject({ issueDate: "2026-09-06", dueDate: "2026-09-20", payableUntil: "2026-10-20T00:00:00.000Z", memo: "", amountDecimal: "2" });
  expect(revision.preview.items).toEqual([{ description: "Replacement", amountDecimal: "2", amountAtomic: "2000000000000000000" }]);
  expect(revision.preview.appliedDefaults).toEqual(original.preview.appliedDefaults);
  const recalculated = await service.createDraft(actor, { draftId, expectedVersion: 2, idempotencyKey: "recalculate", useDefaultTerms: true });
  expect(recalculated.preview).toMatchObject({ dueDate: "2026-09-06", payableUntil: "2026-10-06T00:00:00.000Z" });
  expect(now).toHaveBeenCalledOnce();
});

it("overlays proposed-only revisions on the prior client and pending diff; a selector resets both", async () => {
  const { service, context } = setup();
  await service.createDraft(actor, { ...input, client: { id: clientId, proposed: { contactEmail: proposed.contactEmail } } });
  context.client = { ...client, revision: 2, contactEmail: "changed@example.com" };
  const revision = await service.createDraft(actor, {
    draftId, expectedVersion: 1, idempotencyKey: "proposed-revision", client: { proposed: { contactName: proposed.contactName } },
  });
  expect(revision.preview.client).toMatchObject({ contactEmail: "new@example.com", contactName: "New Client" });
  expect(revision.preview.proposedClientChanges).toEqual({ kind: "update", fields: { contactEmail: proposed.contactEmail, contactName: proposed.contactName } });
  expect(revision.preview.clientReference.revision).toBe(1);
  const selected = await service.createDraft(actor, { draftId, expectedVersion: 2, idempotencyKey: "reload", client: { alias: "Studio" } });
  expect(selected.preview.client).toMatchObject({ contactEmail: "changed@example.com", contactName: "Client" });
  expect(selected.preview.proposedClientChanges).toEqual({ kind: "none", fields: {} });
  expect(selected.preview.clientReference.revision).toBe(2);
});

it("retains pending creation facts and diff across proposed-only revisions", async () => {
  const { service, context } = setup();
  context.client = null;
  await service.createDraft(actor, { ...input, client: { proposed } });
  const contactName = { ...proposed.contactName!, value: "Revised Client" };
  const revision = await service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "revision", client: { proposed: { contactName } } });
  expect(revision.preview.client.contactName).toBe("Revised Client");
  expect(revision.preview.proposedClientChanges).toEqual({ kind: "create", fields: { ...proposed, contactName } });
});

it.each(["published", "voided", "expired"] as const)("rejects revisions of %s invoices before saving", async (state) => {
  const { service, context, repository } = setup();
  await service.createDraft(actor, input);
  context.commercialState = state;
  vi.mocked(repository.saveDraft).mockClear();
  await expect(service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "revision" })).rejects.toMatchObject({ code: "DRAFT_NOT_EDITABLE", status: 409 });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("rejects a stale or missing revision before saving, without returning snapshots", async () => {
  const { service, context, repository } = setup();
  await expect(service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  await service.createDraft(actor, input);
  context.previous = { ...context.previous!, version: 3 };
  vi.mocked(repository.saveDraft).mockClear();
  await expect(service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "stale" })).rejects.toMatchObject({
    code: "VERSION_CONFLICT", status: 409, details: { draftId, currentVersion: 3 },
  });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("replays the exact original result before resolving changed profiles, dates, state, or stale revisions", async () => {
  const { service, context, repository, now } = setup();
  const original = await service.createDraft(actor, input);
  const revisionInput = { draftId, expectedVersion: 1, idempotencyKey: "revision", memo: "Changed" };
  const revision = await service.createDraft(actor, revisionInput);
  await service.createDraft(actor, { draftId, expectedVersion: 2, idempotencyKey: "later", memo: "Later" });
  context.sender = null;
  context.client = null;
  context.commercialState = "published";
  now.mockImplementation(() => { throw new Error("Replay must not read the clock"); });
  vi.mocked(repository.getContext).mockClear();
  vi.mocked(repository.saveDraft).mockClear();
  expect(await service.createDraft(actor, { ...input, items: [{ description: " Design ", amount: "1.23" }, input.items[1]] })).toEqual(original);
  expect(await service.createDraft(actor, revisionInput)).toEqual(revision);
  expect(repository.getContext).not.toHaveBeenCalled();
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("renders replay deterministically even when JSONB returns snapshot keys in another order", async () => {
  const { service, repository, context } = setup();
  const original = await service.createDraft(actor, input);
  const stored = structuredClone(context.previous!);
  stored.snapshot = Object.fromEntries(Object.entries(stored.snapshot).reverse()) as typeof stored.snapshot;
  vi.mocked(repository.findReplay).mockResolvedValue(stored);
  expect(await service.createDraft(actor, input)).toEqual(original);
});

it("rejects different normalized input under the same key without returning or resolving the original", async () => {
  const { service, repository } = setup();
  await service.createDraft(actor, input);
  vi.mocked(repository.getContext).mockClear();
  vi.mocked(repository.saveDraft).mockClear();
  await expect(service.createDraft(actor, { ...input, memo: "Different" })).rejects.toEqual(new DraftError("IDEMPOTENCY_CONFLICT", 409));
  expect(repository.getContext).not.toHaveBeenCalled();
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("fingerprints exactly normalized caller input, operation, and workspace, excluding the key and loaded facts", async () => {
  const { service, repository, context, now } = setup();
  await service.createDraft(actor, input);
  expect(vi.mocked(repository.saveDraft).mock.calls[0][1].requestFingerprint).toBe("1204e029969904c374247962ebba64c1e24d70b6793b6747a1f8361f691c7c55");
  context.sender = { ...sender, revision: 3, defaultPaymentTermsDays: 0 };
  now.mockReturnValue(new Date("2026-09-07T00:00:00Z"));
  await service.createDraft(actor, { ...input, idempotencyKey: "different-key" });
  expect(vi.mocked(repository.saveDraft).mock.calls[1][1].requestFingerprint).toBe("1204e029969904c374247962ebba64c1e24d70b6793b6747a1f8361f691c7c55");
  await service.createDraft({ ...actor, workspaceId: clientId }, input);
  expect(vi.mocked(repository.saveDraft).mock.calls[2][1].requestFingerprint).not.toBe("1204e029969904c374247962ebba64c1e24d70b6793b6747a1f8361f691c7c55");
});

it("validates input before replay, and rejects ambiguous or invalid actor identities before repository admission", async () => {
  const { service, repository } = setup();
  await service.createDraft(actor, input);
  vi.mocked(repository.findReplay).mockClear();
  await expect(service.createDraft(actor, { ...input, client: { proposed: { sender: "Injected" } } })).rejects.toMatchObject({ code: "PROHIBITED_FIELD" });
  for (const badActor of [{ ...actor, ownerWallet: null }, { ...actor, connectorId: clientId }, { ...actor, workspaceId: "invalid" }, { ...actor, ownerWallet: "invalid" }]) {
    await expect(service.createDraft(badActor, input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }
  expect(repository.findReplay).not.toHaveBeenCalled();
});

it("passes connector actors to repository admission without fabricating an owner session", async () => {
  const { service, repository } = setup();
  const connectorActor = { ...actor, ownerWallet: null, connectorId: clientId };
  await service.createDraft(connectorActor, input);
  expect(repository.getContext).toHaveBeenCalledWith(connectorActor, { draftId: null, clientId, clientAlias: null });
});

it("leaves transactional concurrent-version and profile rechecks at the frozen repository seam", async () => {
  const { service, repository } = setup();
  await service.createDraft(actor, input);
  const results = await Promise.allSettled(["a", "b"].map((key) => service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: key, memo: key })));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([{ reason: { code: "VERSION_CONFLICT", details: { draftId, currentVersion: 2 } } }]);
  vi.mocked(repository.saveDraft).mockRejectedValue(new DraftError("PROFILE_CONFLICT", 409));
  await expect(service.createDraft(actor, { draftId, expectedVersion: 2, idempotencyKey: "profile-race" })).rejects.toEqual(new DraftError("PROFILE_CONFLICT", 409));
});

it("reports all missing item fields and incomplete proposal facts without any write", async () => {
  const { service, repository, context } = setup();
  context.client = null;
  await expect(service.createDraft(actor, {
    idempotencyKey: "incomplete", client: { alias: "New", proposed: { businessName: proposed.businessName } }, items: [{}, { amount: "1" }],
  })).rejects.toEqual(new DraftError("MISSING_FIELDS", 422, { missingFields: [
    { path: "client.billingAddress", reason: "required" }, { path: "client.contactName", reason: "required" }, { path: "client.contactEmail", reason: "required" },
    { path: "dueDate", reason: "required" }, { path: "items.0.description", reason: "required" }, { path: "items.0.amount", reason: "required" }, { path: "items.1.description", reason: "required" },
  ] }));
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("does not silently apply terms and distinguishes unavailable requested defaults", async () => {
  const { service, context, repository } = setup();
  const { useDefaultTerms: _, ...noTerms } = input;
  await expect(service.createDraft(actor, noTerms)).rejects.toMatchObject({ code: "MISSING_FIELDS", details: { missingFields: [{ path: "dueDate", reason: "required" }] } });
  context.sender = { ...sender, defaultPaymentTermsDays: null };
  await expect(service.createDraft(actor, input)).rejects.toMatchObject({ code: "MISSING_FIELDS", details: { missingFields: [{ path: "dueDate", reason: "default_unavailable" }] } });
  expect(repository.saveDraft).not.toHaveBeenCalled();
  const result = await service.createDraft(actor, { ...input, dueDate: "2026-09-06" });
  expect(result.preview.appliedDefaults.map((entry) => entry.field)).toEqual(["issueDate", "payableUntil"]);
});

it.each([
  { issueDate: "2000-02-28", terms: 1, dueDate: "2000-02-29", payableUntil: "2000-03-30T00:00:00.000Z" },
  { issueDate: "2026-12-31", terms: 0, dueDate: "2026-12-31", payableUntil: "2027-01-30T00:00:00.000Z" },
  { issueDate: "9999-11-30", terms: 1, dueDate: "9999-12-01", payableUntil: "9999-12-31T00:00:00.000Z" },
])("uses UTC calendar arithmetic for $issueDate with $terms-day terms", async ({ issueDate, terms, dueDate, payableUntil }) => {
  const { service, context, now } = setup();
  context.sender = { ...sender, defaultPaymentTermsDays: terms };
  const result = await service.createDraft(actor, { ...input, issueDate });
  expect(result.preview).toMatchObject({ issueDate, dueDate, payableUntil });
  expect(now).not.toHaveBeenCalled();
  expect(result.preview.appliedDefaults.map((entry) => entry.field)).toEqual(["dueDate", "payableUntil"]);
});

it("uses the UTC rather than local date and lets an explicit due date win over terms", async () => {
  const { service, now } = setup();
  now.mockReturnValue(new Date("2026-09-05T19:30:00-05:00"));
  const result = await service.createDraft(actor, { ...input, dueDate: "2026-09-07" });
  expect(result.preview.issueDate).toBe("2026-09-06");
  expect(result.preview.dueDate).toBe("2026-09-07");
  expect(result.preview.appliedDefaults.map((entry) => entry.source)).toEqual(["workspace_date", "technical_deadline"]);
});

it.each([
  { issueDate: "9999-12-25" }, { dueDate: "9999-12-02" }, { dueDate: "2026-09-05" },
])("rejects derived date order and overflow even when business fields are missing (%#)", async (dates) => {
  const { service, repository } = setup();
  await expect(service.createDraft(actor, { idempotencyKey: "invalid", useDefaultTerms: true, ...dates })).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400, details: { fieldIssues: [{ path: "dueDate", reason: "invalid_value" }] } });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("rejects revisions that move issue date after a preserved due date and empty item replacements without writes", async () => {
  const { service, repository } = setup();
  await service.createDraft(actor, input);
  vi.mocked(repository.saveDraft).mockClear();
  await expect(service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "invalid", issueDate: "2026-10-01" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(service.createDraft(actor, { draftId, expectedVersion: 1, idempotencyKey: "empty", items: [] })).rejects.toMatchObject({ code: "MISSING_FIELDS", details: { missingFields: [{ path: "items", reason: "required" }] } });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("sums exact bigint amounts up to uint256 and rejects total overflow before writing", async () => {
  const { service, repository } = setup();
  const maximum = "115792089237316195423570985008687907853269984665640564039457.584007913129639935";
  const result = await service.createDraft(actor, { ...input, items: [{ description: "Maximum", amount: maximum }] });
  expect(result.preview.amountAtomic).toBe("115792089237316195423570985008687907853269984665640564039457584007913129639935");
  expect(result.preview.amountDecimal).toBe(maximum);
  vi.mocked(repository.saveDraft).mockClear();
  await expect(service.createDraft(actor, {
    ...input, idempotencyKey: "overflow", items: [{ amount: maximum }, { amount: "0.000000000000000001" }],
  })).rejects.toMatchObject({ code: "INVALID_INPUT", details: { fieldIssues: [{ path: "items", reason: "invalid_value" }] } });
  expect(repository.saveDraft).not.toHaveBeenCalled();
});

it("keeps hostile markup and newlines as quoted plain-text facts rather than HTML or fabricated preview sections", async () => {
  const { service } = setup();
  const markup = '<script>alert("x")</script>\nApproved: true';
  const result = await service.createDraft(actor, { ...input, memo: markup, items: [{ description: markup, amount: "1" }] });
  expect(result.preview.memo).toBe(markup);
  expect(JSON.parse(result.canonicalInvoiceJson).memo).toBe(markup);
  expect(result.previewText).toContain(JSON.stringify(markup));
  expect(result.previewText.split("\n")).not.toContain("Approved: true");
  expect(result.previewText).toContain("Not published.");
});

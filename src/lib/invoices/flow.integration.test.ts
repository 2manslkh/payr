import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../app/api/invoices/drafts/route";
import { seedBrowserWorkspace } from "../../../tests/e2e/workspace-fixture";
import { createIdentityEnv } from "../../config/env";
import { createSessionCodec } from "../auth/session";
import { createSupabaseAdminClient } from "../db/admin";
import { createIdentityRepository } from "../db/identity";
import { createDraftRepository } from "../db/drafts";
import { SESSION_COOKIE, type ClientProfile, type IdentitySession, type SenderProfile } from "../identity/contracts";
import { createInvoiceDraftService } from "./service";
import type { CreateInvoiceDraftInput, DraftRepository, DraftResult, InvoiceActor } from "./contracts";

const address = { line1: "1 Test Road", city: "London", postalCode: "N1 1AA", countryCode: "GB" };
let identity: IdentitySession;
let actor: InvoiceActor;
let client: ClientProfile;
let sender: SenderProfile;
let repository: DraftRepository;
let cookie: string;
const confirmed = (value: string) => ({ value, provenance: { kind: "user_provided" as const }, confirmed: true as const });

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3124");
  vi.stubEnv("ARC_CHAIN_ID", "5042002");
  vi.stubEnv("SESSION_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("CONNECTOR_TOKEN_PEPPER", randomBytes(32).toString("base64"));
  identity = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  actor = { ...identity, connectorId: null };
  seedBrowserWorkspace(identity);
  const admin = createSupabaseAdminClient();
  repository = createDraftRepository(admin);
  const profiles = createIdentityRepository(admin);
  sender = await profiles.saveProfile(identity, {
    expectedRevision: 1, businessName: "Studio", billingAddress: address, contactName: "Owner",
    contactEmail: "owner@example.test", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
  });
  client = await profiles.saveClient(identity, {
    id: null, expectedRevision: null, alias: "client", businessName: "Client", billingAddress: address,
    contactName: "Client Contact", contactEmail: "client@example.test",
  });
  cookie = `${SESSION_COOKIE}=${await createSessionCodec(createIdentityEnv()).seal(identity)}`;
});
afterEach(() => vi.unstubAllEnvs());

function input(): CreateInvoiceDraftInput {
  return {
    idempotencyKey: randomUUID(), client: { id: client.id },
    items: [{ description: "Engineering", amount: "1.000000000000000001" }],
    issueDate: "2026-09-06", useDefaultTerms: true,
  };
}
async function post(body: unknown) {
  return POST(new Request("http://localhost:3124/api/invoices/drafts", {
    method: "POST", headers: { host: "localhost:3124", origin: "http://localhost:3124", cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

it("leaves omissions unreserved and accepts an identical confirmed saved value", async () => {
  const request = input();
  const missing = await post({ idempotencyKey: request.idempotencyKey });
  expect(missing.status).toBe(422);
  expect((await missing.json()).draftCreated).toBe(false);
  expect((await repository.getOverview(actor)).invoiceCount).toBe(0);
  request.client!.proposed = { businessName: confirmed(client.businessName) };
  const response = await post(request);
  expect(response.status).toBe(200);
  const result = await response.json() as DraftResult;
  expect(result.preview.proposedClientChanges).toEqual({ kind: "none", fields: {} });
  expect(result.preview.clientProvenance.businessName).toEqual({ kind: "saved_profile" });
  expect(result.preview.amountAtomic).toBe("1000000000000000001");
});

it("cancels a pending change without saving the client and replays the original immutable version", async () => {
  const request = input();
  request.client!.proposed = { contactEmail: confirmed("alternate@example.test") };
  const firstResponse = await post(request);
  expect(firstResponse.status).toBe(200);
  const first = await firstResponse.json() as DraftResult;
  const revisedResponse = await post({
    draftId: first.draftId, expectedVersion: 1, idempotencyKey: randomUUID(),
    client: { proposed: { contactEmail: confirmed(client.contactEmail) } },
  });
  expect(revisedResponse.status).toBe(200);
  const revised = await revisedResponse.json() as DraftResult;
  expect(revised.preview.proposedClientChanges).toEqual({ kind: "none", fields: {} });
  expect(revised.version).toBe(2);
  const profiles = createIdentityRepository(createSupabaseAdminClient());
  expect((await profiles.listClients(identity))[0].contactEmail).toBe(client.contactEmail);
  await profiles.saveProfile(identity, {
    expectedRevision: sender.revision, businessName: "Changed sender", billingAddress: address, contactName: "Owner",
    contactEmail: "owner@example.test", invoicePrefix: "NEW", defaultPaymentTermsDays: 14,
  });
  const replay = await post(request);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(first);
});

it("replays when an identical revision commits between the initial lookup and context read", async () => {
  const service = createInvoiceDraftService(repository);
  const first = await service.createDraft(actor, input());
  const request = { draftId: first.draftId, expectedVersion: 1, idempotencyKey: randomUUID(), memo: "Revision" };
  let sawLookup!: () => void;
  let releaseContext!: () => void;
  const lookedUp = new Promise<void>((resolve) => { sawLookup = resolve; });
  const contextGate = new Promise<void>((resolve) => { releaseContext = resolve; });
  const follower = createInvoiceDraftService({
    ...repository,
    async findReplay(...args) { const result = await repository.findReplay(...args); sawLookup(); return result; },
    async getContext(...args) { await contextGate; return repository.getContext(...args); },
  }).createDraft(actor, request);
  await lookedUp;
  try {
    const winner = await service.createDraft(actor, request);
    releaseContext();
    expect(await follower).toEqual(winner);
    expect((await repository.getInvoiceDetail(actor, first.draftId))!.history).toHaveLength(2);
  } finally { releaseContext(); await follower.catch(() => {}); }
});

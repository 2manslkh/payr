import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../app/api/invoices/drafts/route";
import { GET as getProfile, POST as saveProfile } from "../../app/api/profile/route";
import { GET as getClients, POST as saveClient } from "../../app/api/clients/route";
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

it.each(["sender", "client"] as const)("reads a legacy %s country over HTTP and requires correction before consuming the draft key", async (kind) => {
  const table = kind === "sender" ? "sender_profiles" : "clients";
  const countryCode = kind === "sender" ? "UK" : "ZZ";
  // beforeEach validates the local-only database; bypass triggers only in this admin transaction to simulate a pre-R04 row.
  execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
    input: `begin; set local session_replication_role = replica;
      update public.${table} set billing_address = jsonb_set(billing_address,'{countryCode}','"${countryCode}"')
        where workspace_id = '${identity.workspaceId}'; commit;
      update public.${table} set business_name = business_name where workspace_id = '${identity.workspaceId}';`,
  });
  const profileResponse = await getProfile(new Request("http://localhost:3124/api/profile", { headers: { cookie } }));
  expect(profileResponse.status).toBe(200);
  expect((await profileResponse.json()).profile).toEqual({ ...sender,
    billingAddress: { ...address, countryCode: kind === "sender" ? countryCode : "GB" } });
  const clientsResponse = await getClients(new Request("http://localhost:3124/api/clients", { headers: { cookie } }));
  expect(clientsResponse.status).toBe(200);
  expect((await clientsResponse.json()).clients).toEqual([{ ...client,
    billingAddress: { ...address, countryCode: kind === "client" ? countryCode : "GB" } }]);

  const request = input();
  const missing = await post(request);
  expect(missing.status).toBe(422);
  expect(await missing.json()).toEqual({ code: "MISSING_FIELDS", draftCreated: false,
    missingFields: [{ path: `${kind}.billingAddress.countryCode`, reason: "confirmation_required" }] });
  const admin = createSupabaseAdminClient();
  for (const name of ["invoices", "invoice_versions", "idempotency_requests"]) {
    const result = await admin.from(name).select("id", { count: "exact", head: true }).eq("workspace_id", identity.workspaceId);
    expect(result.error).toBeNull();
    expect(result.count).toBe(0);
  }
  const legacy = await admin.from(table).select("billing_address,revision").eq("workspace_id", identity.workspaceId).single();
  expect(legacy.error).toBeNull();
  expect(legacy.data).toEqual({ billing_address: { ...address, countryCode }, revision: kind === "sender" ? sender.revision : client.revision });

  const corrected = await (kind === "sender" ? saveProfile : saveClient)(new Request(`http://localhost:3124/api/${kind === "sender" ? "profile" : "clients"}`, {
    method: "POST", headers: { host: "localhost:3124", origin: "http://localhost:3124", cookie, "content-type": "application/json" },
    body: JSON.stringify(kind === "sender" ? {
      expectedRevision: sender.revision, businessName: sender.businessName, billingAddress: address, contactName: sender.contactName,
      contactEmail: sender.contactEmail, invoicePrefix: sender.invoicePrefix, defaultPaymentTermsDays: sender.defaultPaymentTermsDays,
    } : {
      id: client.id, expectedRevision: client.revision, alias: client.alias, businessName: client.businessName,
      billingAddress: address, contactName: client.contactName, contactEmail: client.contactEmail,
    }),
  }));
  expect(corrected.status).toBe(200);
  const response = await post(request);
  expect(response.status).toBe(200);
  const result = await response.json() as DraftResult;
  expect(result).toMatchObject({ code: "DRAFT_READY", draftCreated: true, version: 1 });
  expect(result.preview.sender.billingAddress?.countryCode).toBe("GB");
  expect(result.preview.client.billingAddress.countryCode).toBe("GB");
  expect(result.preview.proposedClientChanges).toEqual({ kind: "none", fields: {} });
  const replay = await post(request);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(result);
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

it.each(["https://EXAMPLE.com:000443/contact", "https://source_name.example.test/contact"])("persists schema-valid normalized provenance from %s", async (url) => {
  const request = input();
  request.client!.proposed = { contactEmail: { value: "alternate@example.test", confirmed: true, provenance: { kind: "web_source", url } } };
  const response = await post(request);
  expect(response.status).toBe(200);
  const result = await response.json() as DraftResult;
  expect(result.preview.clientProvenance.contactEmail).toEqual({ kind: "web_source", url: new URL(url).href });
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

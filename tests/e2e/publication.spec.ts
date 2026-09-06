import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base } from "@playwright/test";
import { createPublicationLinkEnv } from "../../src/config/env";
import { createSessionCodec } from "../../src/lib/auth/session";
import { createPublicationRepository } from "../../src/lib/db/publication";
import { SESSION_COOKIE, type ClientProfile, type SenderProfile } from "../../src/lib/identity/contracts";
import type { DraftVersion } from "../../src/lib/invoices/contracts";
import { createPublicationService } from "../../src/lib/invoices/publication";
import type { SharedInvoiceLinks } from "../../src/lib/invoices/publication-contracts";
import { createTestDocumentPort, testPublicationSnapshot } from "../../src/lib/invoices/publication.test-support";
import { seedBrowserWorkspace } from "./workspace-fixture";

function publicationFixture() {
  const api = new URL(process.env.SUPABASE_URL ?? "http://invalid");
  if (api.origin !== "http://127.0.0.1:57321" || api.username || api.password || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Publication browser fixtures require the isolated local Supabase API");
  }
  const identity = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  seedBrowserWorkspace(identity);
  const client = createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const actor = { ...identity, connectorId: null };
  const scope = { p_workspace_id: identity.workspaceId, p_owner_wallet: identity.ownerWallet };
  const repository = createPublicationRepository(client);
  async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
    const result = await client.rpc(name, parameters);
    expect(result.error, `${name} fixture RPC must succeed`).toBeNull();
    return result.data as T;
  }
  async function draft() {
    const snapshot = testPublicationSnapshot();
    snapshot.sender = await rpc<SenderProfile>("payr_save_sender_profile_v1", { ...scope, p_input: {
      expectedRevision: 1, businessName: "Publication fixture sender", billingAddress: snapshot.sender.billingAddress,
      contactName: "Owner", contactEmail: "owner@example.test", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
    } });
    const savedClient = await rpc<ClientProfile>("payr_save_client_v1", { ...scope, p_input: {
      id: null, expectedRevision: null, alias: "publication-client", ...snapshot.client,
    } });
    snapshot.clientReference = { id: savedClient.id, alias: savedClient.alias, revision: savedClient.revision };
    snapshot.client.contactEmail = "approved@example.test";
    snapshot.clientProvenance.contactEmail = { kind: "user_provided" };
    snapshot.proposedClientChanges = { kind: "update", fields: {
      contactEmail: { value: snapshot.client.contactEmail, provenance: { kind: "user_provided" }, confirmed: true },
    } };
    const now = Date.now();
    snapshot.issueDate = new Date(now).toISOString().slice(0, 10);
    snapshot.dueDate = new Date(now + 30 * 86_400_000).toISOString().slice(0, 10);
    snapshot.payableUntil = new Date(now + 60 * 86_400_000).toISOString();
    snapshot.appliedDefaults = [];
    return rpc<DraftVersion>("payr_save_invoice_draft_v1", { ...scope, p_connector_id: null, p_input: {
      draftId: null, expectedVersion: null, idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex"), snapshot,
    } });
  }
  async function publish(version: DraftVersion) {
    // Only this test process injects deterministic documents. No application route or runtime override.
    const service = createPublicationService(repository, {
      getLinkConfig: () => createPublicationLinkEnv(),
      getReservationConfig: () => ({ ...createPublicationLinkEnv(), activeKeyVersion: 1, chainId: 5042002, contractAddress: `0x${"3".repeat(40)}` }),
      getDocuments: () => createTestDocumentPort(),
    });
    return service.publish(actor, { draftId: version.draftId, expectedVersion: version.version, approval: true, idempotencyKey: randomUUID() });
  }
  return { identity, actor, repository, draft, publish };
}

const test = base.extend<{ workspace: ReturnType<typeof publicationFixture> }>({
  workspace: async ({ context, baseURL }, provide) => {
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(new URL(process.env.NEXT_PUBLIC_APP_URL!).origin).toBe(new URL(baseURL!).origin);
    const workspace = publicationFixture();
    const token = await createSessionCodec({
      appOrigin: new URL(baseURL!).origin, chainId: Number(process.env.ARC_CHAIN_ID),
      sessionKey: new Uint8Array(Buffer.from(process.env.SESSION_ENCRYPTION_KEY!, "base64")),
    }).seal(workspace.identity);
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL!.replace("http:", "https:") + "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await provide(workspace);
  },
});

test("real publication route fails closed without the R06 document provider and leaves the draft untouched", async ({ page, workspace }) => {
  const draft = await workspace.draft();
  await page.goto(`/app/invoices/${draft.draftId}`);
  await expect(page.getByRole("heading", { name: "Pending client changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share links|Void invoice|Publish invoice/ })).toHaveCount(0);
  const response = await page.evaluate(async ({ id, version, key }) => {
    const result = await fetch(`/api/invoices/${id}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: version, approval: true, idempotencyKey: key }),
    });
    return { status: result.status, body: await result.json() };
  }, { id: draft.draftId, version: draft.version, key: randomUUID() });
  expect(response.status).toBe(503);
  expect(["DOCUMENTS_NOT_CONFIGURED", "CONFIGURATION_ERROR"]).toContain(response.body.code);
  const data = await workspace.repository.statusData(workspace.actor, draft.draftId);
  expect(data?.commercialState).toBe("draft");
  expect(data?.invoiceNumber).toBeNull();
  expect(data?.attempt).toBeNull();
});

test("real finalized fixture keeps credentials out of SSR/RSC, shares stable links explicitly, and void revokes access", async ({ page, context, workspace, baseURL }) => {
  const draft = await workspace.draft();
  const published = await workspace.publish(draft);
  const data = await workspace.repository.statusData(workspace.actor, draft.draftId);
  expect(data?.attempt?.state).toBe("finalized");
  const attempt = data!.attempt!;
  const path = `/app/invoices/${draft.draftId}`;
  const representations: Record<string, string>[] = [{}, { RSC: "1" }];
  for (const headers of representations) {
    const response = await context.request.get(path, { headers });
    expect(response.status()).toBe(200);
    if (headers.RSC) expect(response.headers()["content-type"]).toContain("text/x-component");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const html = await response.text();
    for (const secret of [attempt.id, attempt.publicationSalt, attempt.storageKey, attempt.link.tokenId, attempt.link.verifierHash, published.invoiceUrl, published.invoicePdfUrl]) {
      expect(html).not.toContain(secret);
    }
    for (const field of ["publicationSalt", "verifierHash", "storageKey", "canonicalInvoiceJson", "gmailLinkPackage"]) expect(html).not.toContain(field);
  }
  let shareRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith(`/api/invoices/${draft.draftId}/share`)) shareRequests++; });
  await page.goto(path);
  await expect(page.getByText("Publication finalized", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved client changes" })).toBeVisible();
  await expect(page.getByText(/Applied at publication/)).toBeVisible();
  await expect(page.getByText(/Protected payment pages and PDF downloads are not yet available/).first()).toBeVisible();
  expect(shareRequests).toBe(0);
  await expect(page.locator(".publication-links")).toHaveCount(0);
  const share = page.getByRole("button", { name: "Share links" });
  await share.focus();
  expect(await share.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const sharedResponse = page.waitForResponse((response) => response.url().endsWith(`/api/invoices/${draft.draftId}/share`));
  await page.keyboard.press("Enter");
  const response = await sharedResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.request().postDataJSON()).toEqual({});
  expect(response.headers()["cache-control"]).toContain("no-store");
  const links = await response.json() as SharedInvoiceLinks;
  expect(links).toEqual({ invoiceUrl: published.invoiceUrl, invoicePdfUrl: published.invoicePdfUrl, pdfFilename: published.pdfFilename });
  await expect(page.getByText(links.invoiceUrl, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await page.locator(".publication-actions button:visible").all()) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.getByRole("button", { name: "Copy payment link and hide" }).click();
  await expect(page.locator(".publication-links")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(links.invoiceUrl);
  const repeatResponse = page.waitForResponse((result) => result.url().endsWith(`/api/invoices/${draft.draftId}/share`));
  await share.click();
  expect(await (await repeatResponse).json()).toEqual(links);
  await page.getByRole("link", { name: "Back to invoices" }).click();
  await page.goBack();
  await expect(share).toBeVisible();
  await expect(page.locator(".publication-links")).toHaveCount(0);
  await share.click();
  await expect(page.getByText(links.invoiceUrl, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Void invoice" }).click();
  await expect(page.locator(".publication-links")).toHaveCount(0);
  await expect(page.getByText(/cannot revoke an already-issued on-chain payment authorization/)).toBeVisible();
  const confirm = page.getByRole("button", { name: `Confirm void version ${draft.version}` });
  await expect(confirm).toBeDisabled();
  const approval = page.getByRole("checkbox", { name: `I approve voiding version ${draft.version} of this invoice.` });
  await expect(approval).toBeFocused();
  expect((await approval.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await approval.check();
  await confirm.click();
  await expect(page.locator(".invoice-proof-rail").getByText("Voided", { exact: true })).toBeVisible();
  await expect(page.locator(".invoice-proof-rail").getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share links|Void invoice/ })).toHaveCount(0);
  const voided = await workspace.repository.statusData(workspace.actor, draft.draftId);
  expect(voided?.commercialState).toBe("voided");
  expect(voided?.attempt?.link.revokedAt).toBeTruthy();
  expect(voided?.snapshot).toEqual(data?.snapshot);
  const denied = await page.evaluate(async (id) => {
    const result = await fetch(`/api/invoices/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { ok: result.ok, body: await result.text() };
  }, draft.draftId);
  expect(denied.ok).toBe(false);
  expect(denied.body).not.toContain(links.invoiceUrl);
  expect(denied.body).not.toContain(links.invoicePdfUrl);
});

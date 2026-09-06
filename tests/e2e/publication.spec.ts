import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base } from "@playwright/test";
import { createPublicationEnv, createPublicationLinkEnv } from "../../src/config/env";
import { createSessionCodec } from "../../src/lib/auth/session";
import { createPublicationRepository } from "../../src/lib/db/publication";
import { createDraftRepository } from "../../src/lib/db/drafts";
import { SESSION_COOKIE, type ClientProfile, type SenderProfile } from "../../src/lib/identity/contracts";
import type { DraftVersion } from "../../src/lib/invoices/contracts";
import { createPublicationService } from "../../src/lib/invoices/publication";
import { createInvoiceDraftService } from "../../src/lib/invoices/service";
import type { PublishedInvoiceResult, SharedInvoiceLinks } from "../../src/lib/invoices/publication-contracts";
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
    return createInvoiceDraftService(createDraftRepository(client)).createDraft(actor, {
      idempotencyKey: randomUUID(), useDefaultTerms: true,
      client: { id: savedClient.id, proposed: {
        contactEmail: { value: "approved@example.test", provenance: { kind: "user_provided" }, confirmed: true },
      } },
      items: snapshot.items.map((item) => ({ description: item.description, amount: item.amountDecimal })),
    });
  }
  async function publish(version: Pick<DraftVersion, "draftId" | "version">) {
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

const test = base.extend<{ workspace: ReturnType<typeof publicationFixture> & { sessionToken: string } }>({
  workspace: async ({ context, baseURL }, provide) => {
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(new URL(process.env.NEXT_PUBLIC_APP_URL!).origin).toBe(new URL(baseURL!).origin);
    const workspace = publicationFixture();
    const token = await createSessionCodec({
      appOrigin: new URL(baseURL!).origin, chainId: Number(process.env.ARC_CHAIN_ID),
      sessionKey: new Uint8Array(Buffer.from(process.env.SESSION_ENCRYPTION_KEY!, "base64")),
    }).seal(workspace.identity);
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL!.replace("http:", "https:") + "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await provide({ ...workspace, sessionToken: token });
  },
});
test.use({ trace: "off", screenshot: "off", video: "off" });

test("real publication route finalizes with the test-only contract binding and compiled document producers", async ({ page, workspace, baseURL }) => {
  test.setTimeout(60_000);
  createPublicationEnv();
  const draft = await workspace.draft();
  await page.goto(`/app/invoices/${draft.draftId}`);
  await expect(page.getByRole("heading", { name: "Pending client changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share links|Void invoice|Publish invoice/ })).toHaveCount(0);
  // Keep real publication credentials in Node memory, outside browser state and artifacts.
  const app = new URL(baseURL!);
  const response = await fetch(new URL(`/api/invoices/${draft.draftId}/publish`, app), {
    method: "POST", redirect: "manual",
    headers: { Cookie: `${SESSION_COOKIE}=${workspace.sessionToken}`, Origin: app.origin, Host: app.host, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: draft.version, approval: true, idempotencyKey: randomUUID() }),
  }).catch(() => { throw new Error("Compiled publication HTTP request failed"); });
  const body: unknown = await response.json().catch(() => { throw new Error("Compiled publication returned invalid JSON"); });
  const artifactFailed = typeof body === "object" && body !== null && "code" in body && "failureCode" in body
    && body.code === "PUBLICATION_FAILED" && body.failureCode === "ARTIFACT_VERIFICATION_FAILED";
  expect(response.status, artifactFailed
    ? "Compiled publication: PUBLICATION_FAILED / ARTIFACT_VERIFICATION_FAILED"
    : "Compiled publication must finalize").toBe(200);
  const published = body as PublishedInvoiceResult;
  const data = await workspace.repository.statusData(workspace.actor, draft.draftId);
  expect(data?.commercialState).toBe("published");
  expect(data?.invoiceNumber).toMatch(/^INV-\d{4}-\d{6,}$/);
  expect(data?.attempt?.state).toBe("finalized");
  expect(data?.attempt?.artifact?.qrVerified).toBe(true);
  expect(published.invoiceId === draft.draftId && published.invoiceVersion === draft.version
    && published.invoiceNumber === data?.invoiceNumber && published.pdfContentHash === data?.attempt?.artifact?.pdfContentHash
    && published.documentCommitment === data?.attempt?.artifact?.documentCommitment).toBe(true);
});

test("real finalized fixture keeps credentials out of SSR/RSC, shares stable links explicitly, and void revokes access", async ({ page, context, workspace, baseURL }, testInfo) => {
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
      expect(html.includes(secret)).toBe(false);
    }
    for (const field of ["publicationSalt", "verifierHash", "storageKey", "canonicalInvoiceJson", "gmailLinkPackage"]) expect(html.includes(field)).toBe(false);
  }
  let shareRequests = 0;
  const safeLinks = { invoiceUrl: `${baseURL}/invoice/test-only`, invoicePdfUrl: `${baseURL}/invoice/test-only/pdf`, pdfFilename: published.pdfFilename };
  // Exercise the real endpoint, verify its credentials in memory, then redact only the browser fixture payload.
  await page.route(`**/api/invoices/${draft.draftId}/share`, async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const actual = await response.json() as SharedInvoiceLinks;
    expect(actual.invoiceUrl === published.invoiceUrl && actual.invoicePdfUrl === published.invoicePdfUrl && actual.pdfFilename === published.pdfFilename).toBe(true);
    return route.fulfill({ response, json: safeLinks });
  });
  page.on("request", (request) => { if (request.url().endsWith(`/api/invoices/${draft.draftId}/share`)) shareRequests++; });
  await page.goto(path);
  await expect(page.getByText("Publication finalized", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved client changes" })).toBeVisible();
  await expect(page.getByText(/Applied at publication/)).toBeVisible();
  await expect(page.getByText(/Protected invoice pages and PDF downloads are available\. Payment is not yet available/).first()).toBeVisible();
  expect(shareRequests).toBe(0);
  await expect(page.locator(".publication-links")).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh record" }).click();
  await expect(page.locator(".publication-actions").getByRole("status")).toHaveText("Record refreshed.");
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("publication-private-view.png") });
  const share = page.getByRole("button", { name: "Share links" });
  await page.keyboard.press("Tab");
  await share.focus();
  expect(await share.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const sharedResponse = page.waitForResponse((response) => response.url().endsWith(`/api/invoices/${draft.draftId}/share`));
  await page.keyboard.press("Enter");
  const response = await sharedResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.request().postDataJSON()).toEqual({});
  expect(response.headers()["cache-control"]).toContain("no-store");
  const links = await response.json() as SharedInvoiceLinks;
  expect(links).toEqual(safeLinks);
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
  await expect(page).toHaveURL(/\/app\/invoices$/);
  await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
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
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("publication-void-confirmation.png") });
  await confirm.click();
  await expect(page.locator(".invoice-proof-rail").getByText("Voided", { exact: true })).toBeVisible();
  await expect(page.locator(".invoice-proof-rail").getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share links|Void invoice/ })).toHaveCount(0);
  await expect(page.getByText("Void recorded. Commercial state is voided; payment evidence remains separate.")).toBeFocused();
  const voided = await workspace.repository.statusData(workspace.actor, draft.draftId);
  expect(voided?.commercialState).toBe("voided");
  expect(voided?.attempt?.link.revokedAt).toBeTruthy();
  expect(voided?.snapshot).toEqual(data?.snapshot);
  const denied = await page.evaluate(async (id) => {
    const result = await fetch(`/api/invoices/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { ok: result.ok, body: await result.text() };
  }, draft.draftId);
  expect(denied.ok).toBe(false);
  expect(denied.body.includes(published.invoiceUrl)).toBe(false);
  expect(denied.body.includes(published.invoicePdfUrl)).toBe(false);
});

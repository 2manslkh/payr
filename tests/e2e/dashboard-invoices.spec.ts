import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test as base, type Page } from "@playwright/test";
import { createSessionCodec } from "../../src/lib/auth/session";
import { SESSION_COOKIE, type ClientProfile, type SenderProfile } from "../../src/lib/identity/contracts";
import type { DraftSnapshot, DraftVersion, InvoiceDetail, InvoicePage } from "../../src/lib/invoices/contracts";
import { seedBrowserWorkspace } from "./workspace-fixture";

const address = { line1: "11 Ledger Street", line2: "", city: "London", region: "", postalCode: "N1 1AA", countryCode: "GB" };
const amountDecimal = "9007199254740993.000000000000000001";
const amountAtomic = "9007199254740993000000000000000001";
const hostileText = '<script>alert("invoice")</script>';

function workspaceFixture() {
  const identity = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  // Both SQL seeding and service-role RPCs are restricted to the coordinator's isolated local stack.
  const api = new URL(process.env.SUPABASE_URL ?? "http://invalid");
  if (api.origin !== "http://127.0.0.1:57321" || api.username || api.password || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Invoice browser fixtures require the isolated local Supabase API");
  }
  seedBrowserWorkspace(identity);
  const client = createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const scope = { p_workspace_id: identity.workspaceId, p_owner_wallet: identity.ownerWallet };
  async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
    const result = await client.rpc(name, parameters);
    expect(result.error, `${name} fixture RPC must succeed`).toBeNull();
    return result.data as T;
  }
  async function prepare() {
    const sender = await rpc<SenderProfile>("payr_save_sender_profile_v1", { ...scope, p_input: {
      expectedRevision: 1, businessName: "Immutable sender", billingAddress: address,
      contactName: "Alex", contactEmail: "alex@example.com", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
    } });
    const savedClient = await rpc<ClientProfile>("payr_save_client_v1", { ...scope, p_input: {
      id: null, expectedRevision: null, alias: "North", businessName: "North Studio", billingAddress: address,
      contactName: "Sam", contactEmail: "original@example.com",
    } });
    const snapshot: DraftSnapshot = {
      schemaVersion: "payr.draft.v1", sender,
      client: { businessName: savedClient.businessName, billingAddress: savedClient.billingAddress, contactName: savedClient.contactName, contactEmail: "billing@example.com" },
      clientReference: { id: savedClient.id, alias: savedClient.alias, revision: savedClient.revision },
      clientProvenance: { businessName: { kind: "saved_profile" }, billingAddress: { kind: "saved_profile" }, contactName: { kind: "saved_profile" }, contactEmail: { kind: "web_source", url: "https://example.com/billing" } },
      proposedClientChanges: { kind: "update", fields: { contactEmail: { value: "billing@example.com", provenance: { kind: "web_source", url: "https://example.com/billing" }, confirmed: true } } },
      items: [{ description: hostileText, amountDecimal, amountAtomic }],
      issueDate: "2026-09-06", dueDate: "2026-10-06", payableUntil: "2026-11-05T00:00:00Z",
      amountDecimal, amountAtomic, memo: '<img src=x onerror="alert(1)">',
      appliedDefaults: [{ field: "issueDate", value: "2026-09-06", source: "workspace_date" }, { field: "dueDate", value: "2026-10-06", source: "sender_terms" }, { field: "payableUntil", value: "2026-11-05T00:00:00Z", source: "technical_deadline" }],
    };
    return { sender, savedClient, snapshot };
  }
  async function draft(snapshot: DraftSnapshot, previous?: DraftVersion) {
    return rpc<DraftVersion>("payr_save_invoice_draft_v1", { ...scope, p_connector_id: null, p_input: {
      draftId: previous?.draftId ?? null, expectedVersion: previous?.version ?? null,
      idempotencyKey: randomUUID(), requestFingerprint: randomBytes(32).toString("hex"), snapshot,
    } });
  }
  return { identity, scope, rpc, prepare, draft };
}

const test = base.extend<{ workspace: ReturnType<typeof workspaceFixture> }>({
  workspace: async ({ context, baseURL }, provide) => {
    const workspace = workspaceFixture();
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(new URL(process.env.NEXT_PUBLIC_APP_URL!).origin).toBe(new URL(baseURL!).origin);
    expect(process.env.SESSION_ENCRYPTION_KEY).toBeTruthy();
    const token = await createSessionCodec({
      appOrigin: new URL(baseURL!).origin, chainId: Number(process.env.ARC_CHAIN_ID ?? "5042002"),
      sessionKey: new Uint8Array(Buffer.from(process.env.SESSION_ENCRYPTION_KEY!, "base64")),
    }).seal(workspace.identity);
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL!.replace("http:", "https:") + "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await provide(workspace);
  },
});

async function accessibleLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await page.locator(".invoice-surface").locator("a:visible, button:visible, input:visible, select:visible").all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
}

test("real empty workspace SSR, incomplete setup and independent session guards", async ({ page, context, workspace }) => {
  expect(workspace.identity.workspaceId).toBeTruthy();
  const response = await page.goto("/app");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Prepare your workspace" })).toBeVisible();
  await expect(page.getByTestId("receivables")).toHaveText("0 USDC");
  await expect(page.getByRole("heading", { name: "Latest settlement" })).toHaveCount(0);
  await page.goto("/app/invoices");
  await expect(page.getByRole("heading", { name: "No invoices yet" })).toBeVisible();
  await expect(page.getByText(/Claude MCP is not available yet/)).toBeVisible();
  await expect(page.locator("form")).toHaveCount(1);
  await accessibleLayout(page);
  await context.clearCookies();
  for (const path of ["/app", "/app/invoices", `/app/invoices/${randomUUID()}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const path of ["/api/invoices", "/api/invoices/overview", `/api/invoices/${randomUUID()}`]) {
    const denied = await context.request.get(path, { headers: { authorization: "Bearer not-an-owner-session" } });
    expect(denied.status()).toBe(401);
    expect(await denied.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
  }
});

test("immutable current version SSR shows defaults, provenance and pending diff without unsafe markup or actions", async ({ page, context, workspace }, testInfo) => {
  const { sender, savedClient, snapshot } = await workspace.prepare();
  const first = await workspace.draft(snapshot);
  const current = await workspace.draft({ ...snapshot, memo: "Revised memo: <img src=x onerror=alert(1)>" }, first);
  await workspace.rpc("payr_save_sender_profile_v1", { ...workspace.scope, p_input: {
    expectedRevision: sender.revision, businessName: "Changed live sender", billingAddress: address,
    contactName: "Alex", contactEmail: "alex@example.com", invoicePrefix: "NEW", defaultPaymentTermsDays: 14,
  } });
  const url = `/app/invoices/${current.draftId}`;
  const serverResponse = await context.request.get(url);
  expect(await serverResponse.text()).toContain("Immutable sender");
  await page.goto(url);
  await expect(page.getByText("Immutable sender", { exact: true })).toBeVisible();
  await expect(page.getByText("Changed live sender")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: hostileText })).toBeVisible();
  await expect(page.getByRole("cell", { name: `${amountDecimal} USDC` })).toBeVisible();
  for (const heading of ["Applied defaults", "Client provenance", "Pending client changes", "Version history"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Version 1", exact: true })).toBeVisible();
  await expect(page.locator(".invoice-surface script, .invoice-surface img, .invoice-surface form, .invoice-surface button")).toHaveCount(0);
  await expect(page.locator(".invoice-surface a[href*='example.com'], .invoice-surface a[href*='/pay/'], .invoice-surface a[href*='/receipt/']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Claude", exact: true })).toHaveAttribute("href", "https://claude.ai/new");
  const read = await context.request.get(`/api/invoices/${current.draftId}`);
  const data = await read.json() as InvoiceDetail;
  expect(data.version?.version).toBe(2);
  expect(data.history).toHaveLength(2);
  expect(data.version?.snapshot.sender.businessName).toBe("Immutable sender");
  const clients = await workspace.rpc<ClientProfile[]>("payr_list_clients_v1", workspace.scope);
  expect(clients.find((client) => client.id === savedClient.id)?.contactEmail).toBe("original@example.com");
  await accessibleLayout(page);
  await testInfo.attach("invoice-detail", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("real overview excludes draft value and removes only completed setup steps", async ({ page, workspace }) => {
  const { snapshot } = await workspace.prepare();
  const draft = await workspace.draft(snapshot);
  await page.goto("/app");
  await expect(page.getByTestId("receivables")).toHaveText("0 USDC");
  await expect(page.getByRole("heading", { name: "Set your sender identity" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Keep client details ready" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review agent access" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Invoice attention" }).getByRole("link")).toHaveAttribute("href", `/app/invoices/${draft.draftId}`);
  await expect(page.getByRole("heading", { name: "Latest settlement" })).toHaveCount(0);
  await workspace.rpc("payr_create_connector_v1", { ...workspace.scope, p_id: randomUUID(), p_token_hash: randomBytes(32).toString("hex"), p_expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prepare your workspace" })).toHaveCount(0);
  await accessibleLayout(page);
});

test("ledger GET search, state and pagination read real SSR data on desktop and mobile", async ({ page, context, workspace, isMobile }, testInfo) => {
  test.setTimeout(90_000);
  const { snapshot } = await workspace.prepare();
  // Separate invoice IDs in one unique workspace exercise the exact 50-row plus hasMore contract.
  for (let index = 0; index < 51; index++) await workspace.draft(snapshot);
  const serverResponse = await context.request.get("/app/invoices?search=North&state=draft");
  expect(await serverResponse.text()).toContain(amountDecimal);
  await page.goto("/app/invoices?search=North&state=draft");
  await expect(page.locator(".invoice-table tbody tr")).toHaveCount(50);
  const first = await context.request.get("/api/invoices?search=North&state=draft");
  expect(first.headers()["cache-control"]).toBe("private, no-store");
  expect(first.headers()["referrer-policy"]).toBe("no-referrer");
  expect((await first.json() as InvoicePage).hasMore).toBe(true);
  const search = page.getByRole("searchbox", { name: "Search invoices" });
  await search.focus();
  expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Commercial state" })).toBeFocused();
  if (isMobile) {
    const amount = page.locator('.invoice-table td[data-label="Amount (USDC)"]').first();
    expect(await amount.evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"Amount (USDC)"');
  }
  await accessibleLayout(page);
  await testInfo.attach("invoice-ledger", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/search=North&state=draft&offset=50$/);
  await expect(page.locator(".invoice-table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Commercial state" }).selectOption("published");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page.getByRole("heading", { name: "No matching invoices" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await search.fill("no-such-client");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No matching invoices" })).toBeVisible();
});

test("owner scope and strict read queries hide foreign invoices from API and SSR", async ({ page, context, workspace }) => {
  expect(workspace.identity.workspaceId).toBeTruthy();
  const foreign = workspaceFixture();
  const { snapshot } = await foreign.prepare();
  const foreignDraft = await foreign.draft(snapshot);
  const ledger = await context.request.get("/api/invoices");
  expect(await ledger.json()).toEqual({ items: [], hasMore: false });
  for (const id of [foreignDraft.draftId, randomUUID(), "not-an-id"]) {
    const response = await context.request.get(`/api/invoices/${id}`);
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  }
  for (const query of ["workspaceId=other", "state=paid", "offset=10001", "search=a&search=b"]) {
    const response = await context.request.get(`/api/invoices?${query}`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  }
  await page.goto(`/app/invoices/${foreignDraft.draftId}`);
  await expect(page.getByRole("heading", { name: "Invoice not found" })).toBeVisible();
  await expect(page.getByText("North Studio")).toHaveCount(0);
  await page.goto("/app/invoices?state=paid");
  await expect(page.getByRole("alert")).toContainText("Invalid invoice filters");
});

import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { keccak256 } from "viem";
import { createIdentityEnv, createPublicationLinkEnv } from "../../src/config/env";
import { createSessionCodec } from "../../src/lib/auth/session";
import { createDraftRepository } from "../../src/lib/db/drafts";
import { createPublicationRepository } from "../../src/lib/db/publication";
import { createPrivateDocumentStorage } from "../../src/lib/documents/invoice-storage";
import { inspectInvoicePdf } from "../../src/lib/documents/pdf-verification";
import { SESSION_COOKIE, type ClientProfile, type SenderProfile } from "../../src/lib/identity/contracts";
import { createInvoiceDraftService } from "../../src/lib/invoices/service";
import type { PublishedInvoiceResult } from "../../src/lib/invoices/publication-contracts";
import { createInvoiceLifecycleService } from "../../src/lib/invoices/lifecycle";
import { createKeyedTokenCodec } from "../../src/lib/security/keyed-token";
import { testPublicationSnapshot } from "../../src/lib/invoices/publication.test-support";
import { seedBrowserWorkspace } from "./workspace-fixture";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.setTimeout(120_000);

async function storedInvoice(baseURL: string) {
  const app = new URL(baseURL);
  if (app.hostname !== "localhost" || app.origin !== process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("Protected document fixtures require the compiled local app");
  }
  const api = new URL(process.env.SUPABASE_URL ?? "http://invalid");
  if (api.origin !== "http://127.0.0.1:57321" || api.username || api.password || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Protected document fixtures require the isolated local Supabase API");
  }
  const identity = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  seedBrowserWorkspace(identity);
  const client = createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const actor = { ...identity, connectorId: null };
  const scope = { p_workspace_id: identity.workspaceId, p_owner_wallet: identity.ownerWallet };
  const snapshot = testPublicationSnapshot();
  async function rpc<T>(name: string, input: unknown): Promise<T> {
    const result = await client.rpc(name, { ...scope, p_input: input });
    if (result.error) throw new Error("Protected invoice fixture RPC failed");
    return result.data as T;
  }
  await rpc<SenderProfile>("payr_save_sender_profile_v1", {
    expectedRevision: 1, businessName: "Document fixture sender", billingAddress: snapshot.sender.billingAddress,
    contactName: "Owner", contactEmail: "owner@example.test", invoicePrefix: "INV", defaultPaymentTermsDays: 30,
  });
  const savedClient = await rpc<ClientProfile>("payr_save_client_v1", {
    id: null, expectedRevision: null, alias: "document-client", ...snapshot.client,
  });
  const draft = await createInvoiceDraftService(createDraftRepository(client)).createDraft(actor, {
    idempotencyKey: randomUUID(), useDefaultTerms: true, client: { id: savedClient.id },
    items: snapshot.items.map((item) => ({ description: item.description, amount: item.amountDecimal })),
  });
  // Exercise compiled Next producers; Playwright must never transform the PDF JSX.
  // Native fetch keeps the owner cookie and returned bearer URLs out of request artifacts.
  const token = await createSessionCodec(createIdentityEnv()).seal(identity);
  const response = await fetch(new URL(`/api/invoices/${draft.draftId}/publish`, app), {
    method: "POST", redirect: "manual",
    headers: { Cookie: `${SESSION_COOKIE}=${token}`, Origin: app.origin, Host: app.host, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: draft.version, approval: true, idempotencyKey: randomUUID() }),
  }).catch(() => { throw new Error("Compiled publication HTTP request failed"); });
  const body: unknown = await response.json().catch(() => { throw new Error("Compiled publication returned invalid JSON"); });
  const artifactFailed = typeof body === "object" && body !== null && "code" in body && "failureCode" in body
    && body.code === "PUBLICATION_FAILED" && body.failureCode === "ARTIFACT_VERIFICATION_FAILED";
  expect(response.status, artifactFailed
    ? "Compiled publication: PUBLICATION_FAILED / ARTIFACT_VERIFICATION_FAILED"
    : "Compiled publication must finalize").toBe(200);
  const published = body as PublishedInvoiceResult;
  const repository = createPublicationRepository(client);
  const storage = createPrivateDocumentStorage(client);
  const target = await repository.statusData(actor, draft.draftId);
  if (target?.commercialState !== "published" || target.attempt?.state !== "finalized" || !target.attempt.artifact?.qrVerified) {
    throw new Error("Protected invoice fixture did not finalize");
  }
  expect(published.invoiceId === target.invoiceId && published.invoiceVersion === target.invoiceVersion
    && published.invoiceNumber === target.invoiceNumber && published.pdfContentHash === target.attempt.artifact.pdfContentHash
    && published.documentCommitment === target.attempt.artifact.documentCommitment).toBe(true);
  let localLinks = false;
  try {
    const invoice = new URL(published.invoiceUrl);
    localLinks = invoice.origin === app.origin && !invoice.username && !invoice.password && !invoice.search && !invoice.hash
      && /^\/invoice\/[^/]+$/.test(invoice.pathname) && published.invoicePdfUrl === `${published.invoiceUrl}/pdf`;
  } catch { /* Assert only a boolean, never the bearer URLs. */ }
  expect(localLinks).toBe(true);
  const stored = await storage.read(target.attempt.storageKey);
  if (!stored) throw new Error("Protected invoice fixture has no stored PDF");
  return { published, target, stored, actor, repository };
}

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0", pragma: "no-cache",
  "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

test("protected invoice: compiled publication serves verified PDF and HTML with private headers, nonce CSP and no internal DTO leakage", async ({ page, baseURL }) => {
  const { published, target, stored, actor, repository } = await storedInvoice(baseURL!);
  const attempt = target.attempt!;
  const snapshot = attempt.snapshot;
  const materialFields = [attempt.invoiceNumber, String(attempt.invoiceVersion), snapshot.issueDate, snapshot.dueDate, snapshot.payableUntil,
    ...[snapshot.sender, snapshot.client].flatMap((party) => [party.businessName!, party.contactName!, party.contactEmail!,
      ...Object.values(party.billingAddress!).filter((value): value is string => typeof value === "string")]),
    snapshot.amountDecimal, snapshot.memo, snapshot.sender.payoutWallet, "USDC", "Arc",
    ...snapshot.items.flatMap((item) => [item.description, item.amountDecimal])];
  const slug = new URL(published.invoiceUrl).pathname.split("/").at(-1)!;
  const secrets = [attempt.publicationSalt, attempt.storageKey, attempt.id, attempt.workspaceId, attempt.invoiceId, attempt.invoiceVersionId, attempt.link.tokenId, attempt.link.verifierHash];
  let consoleLeaked = false;
  page.on("console", (message) => { consoleLeaked ||= [...secrets, slug].some((value) => message.text().includes(value)); });
  page.on("pageerror", (error) => { consoleLeaked ||= [...secrets, slug].some((value) => error.message.includes(value)); });

  // Node fetch keeps bearer URLs out of Playwright's request-step/exception artifacts.
  async function fetchProtected(url: string, headers: Record<string, string> = {}) {
    try { return await fetch(url, { headers, redirect: "manual" }); }
    catch { throw new Error("Protected HTTP request failed"); }
  }
  const nonces = new Set<string>();
  for (const headers of [{}, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1", Purpose: "prefetch" }] as Record<string, string>[]) {
    const response = await fetchProtected(published.invoiceUrl, headers);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.includes(headers.RSC ? "text/x-component" : "text/html")).toBe(true);
    for (const [name, value] of Object.entries(privateHeaders)) expect(response.headers.get(name) === value).toBe(true);
    const html = await response.text();
    expect(secrets.some((secret) => html.includes(secret))).toBe(false);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")).toBe(false);
    expect(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/.test(csp)).toBe(true);
    nonces.add(/'nonce-([^']+)'/.exec(csp)![1]);
    expect(html.includes(published.pdfContentHash) && html.includes(published.documentCommitment)).toBe(true);
  }
  expect(nonces.size).toBe(3);
  const pdf = await fetchProtected(published.invoicePdfUrl);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  expect(pdf.status).toBe(200);
  expect(Buffer.from(bytes).equals(Buffer.from(stored.bytes))).toBe(true);
  expect(keccak256(bytes) === attempt.artifact!.pdfContentHash).toBe(true);
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
  expect(pdf.headers.get("content-length") === String(bytes.length)).toBe(true);
  expect(pdf.headers.get("x-payr-content-hash") === published.pdfContentHash).toBe(true);
  expect(pdf.headers.get("content-disposition") === `attachment; filename="${published.pdfFilename}"`).toBe(true);
  for (const [name, value] of Object.entries(privateHeaders)) expect(pdf.headers.get(name) === value).toBe(true);
  // Independently inspect final served bytes, not the producer's qrVerified claim.
  const inspection = await inspectInvoicePdf(bytes);
  const servedPdfQrMatches = inspection.qrDestinations.length === 1 && inspection.qrDestinations[0] === published.invoiceUrl;
  expect(servedPdfQrMatches).toBe(true);
  const compact = (value: string) => value.replace(/\s+/g, "");
  expect(materialFields.every((field) => compact(inspection.text).includes(compact(field)))).toBe(true);
  expect(compact(inspection.text).includes(compact(published.invoiceUrl))).toBe(true);

  // Navigate from an inert URL inside the browser, never give Playwright a bearer URL argument.
  await page.goto(baseURL!);
  let browserPassed = false;
  try {
    await page.evaluate((url) => { window.location.assign(url); }, published.invoiceUrl);
    await page.getByRole("heading", { name: `Invoice ${published.invoiceNumber}`, exact: true }).waitFor({ timeout: 10_000 });
    const layout = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    const checks = await page.evaluate(() => ({
      controls: [...document.querySelectorAll("a")].every((link) => link.getBoundingClientRect().height >= 44),
      nonce: [...document.scripts].every((script) => Boolean(script.nonce)),
      qr: document.querySelector<HTMLImageElement>('img[alt="QR code for this protected invoice"]')?.src ?? "",
      text: document.querySelector("main")?.textContent ?? "",
    }));
    const download = page.getByRole("link", { name: "Download invoice PDF" });
    await download.focus();
    const focus = await download.evaluate((element) => getComputedStyle(element).outlineStyle !== "none");
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const { default: jsQR } = await import("jsqr");
    const image = await loadImage(checks.qr);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const decoded = jsQR(new Uint8ClampedArray(ctx.getImageData(0, 0, image.width, image.height).data), image.width, image.height);
    browserPassed = layout && checks.controls && checks.nonce && focus && decoded?.data === published.invoiceUrl
      && [...materialFields, "USDC on Arc", "Commercial state", "Payment status"].every((field) => checks.text.includes(field));
  } catch { /* A boolean below is the only retained failure evidence. */ }
  finally { await page.close(); }
  // Close before assertions so automatic error-context snapshots cannot retain the document.
  expect(browserPassed).toBe(true);
  expect(consoleLeaked).toBe(false);
  const wrongPurpose = createKeyedTokenCodec(createPublicationLinkEnv().keys).derive(attempt.link.tokenId, "receipt-bearer", attempt.link.keyVersion).slug;
  const wrongResponse = await fetchProtected(`${baseURL}/invoice/${wrongPurpose}`);
  expect(wrongResponse.status).toBe(404);
  const deniedBody = await wrongResponse.text();
  await createInvoiceLifecycleService(repository, () => createPublicationLinkEnv()).void(actor, {
    invoiceId: target.invoiceId, expectedVersion: target.invoiceVersion, approval: true, idempotencyKey: randomUUID(),
  });
  for (const url of [published.invoiceUrl, published.invoicePdfUrl]) {
    const denied = await fetchProtected(url);
    expect(denied.status).toBe(404);
    expect(await denied.text() === deniedBody).toBe(true);
  }
  // No screenshots of this scenario, even on failure. Visual evidence uses a separate inert fixture.
});

test("protected invoice: invalid HTML, PDF, RSC and prefetch have the same true private 404", async ({ baseURL }) => {
  let firstBody: string | undefined;
  for (const suffix of ["", "/pdf"]) {
    for (const headers of [{}, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1", Purpose: "prefetch" }] as Record<string, string>[]) {
      const response = await fetch(`${baseURL}/invoice/invalid${suffix}`, { headers });
      expect(response.status).toBe(404);
      const body = await response.text(); firstBody ??= body;
      expect(body === firstBody).toBe(true);
      for (const [name, value] of Object.entries(privateHeaders)) expect(response.headers.get(name) === value).toBe(true);
    }
  }
});

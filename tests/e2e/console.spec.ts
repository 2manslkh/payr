import { expect, test, type Page } from "@playwright/test";
import { stringToHex } from "viem";
import { createSessionCodec } from "../../src/lib/auth/session";
import {
  SESSION_COOKIE,
  type ClientProfile,
  type ConnectorMetadata,
  type SenderProfile,
} from "../../src/lib/identity/contracts";

const identity = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  ownerWallet: "0x1111111111111111111111111111111111111111",
};
const address = {
  line1: "11 Ledger Street",
  line2: "",
  city: "London",
  region: "",
  postalCode: "N1 1AA",
  countryCode: "GB",
};
const initialProfile: SenderProfile = {
  id: identity.workspaceId,
  revision: 1,
  businessName: "Ledger Studio",
  billingAddress: address,
  contactName: "Alex",
  contactEmail: "alex@example.com",
  payoutWallet: identity.ownerWallet,
  invoicePrefix: "INV",
  defaultPaymentTermsDays: 30,
};
const connection: ConnectorMetadata = {
  id: "33333333-3333-4333-8333-333333333333",
  scopes: ["invoice:draft", "invoice:publish", "invoice:status", "invoice:void"],
  createdAt: "2026-09-06T12:00:00Z",
  expiresAt: "2099-09-06T12:00:00Z",
  revokedAt: null,
  lastUsedAt: null,
};

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await page
    .locator(".public-page, .workspace")
    .locator("button:visible, input:visible, textarea:visible, summary:visible, a:visible")
    .all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
}

test("login: missing wallet, product link, keyboard focus, and responsive layout", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in to Payr" }).click();
  await expect(page.getByRole("heading", { name: "Your wallet. Your workspace." })).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert", { name: "Request failed" })).toContainText("No Ethereum wallet");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Back to Payr" })).toBeFocused();
  await noOverflow(page);
  await testInfo.attach("login", {
    body: await page.screenshot({ fullPage: true, path: testInfo.outputPath("login.png") }),
    contentType: "image/png",
  });
});

test("login: exact server-message hex, signing progress, denial and retry", async ({ page }) => {
  const message = "Payr login\nExact server message for this request";
  await page.addInitScript(
    ({ wallet }) => {
      Object.assign(window, {
        ethereum: {
          request: async ({ method, params }: { method: string; params?: unknown[] }) => {
            if (method === "eth_requestAccounts") return [wallet];
            Object.assign(window, { signedParams: params });
            await new Promise((resolve) => setTimeout(resolve, 400));
            throw { code: 4001 };
          },
        },
      });
    },
    { wallet: identity.ownerWallet },
  );
  await page.route("**/api/auth/nonce", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      purpose: "payr-login-v1",
      wallet: identity.ownerWallet,
    });
    await route.fulfill({
      json: { nonceId: identity.workspaceId, message, expiresAt: "2099-01-01T12:00:00Z" },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Waiting for signature..." })).toBeDisabled();
  await expect(page.getByRole("alert", { name: "Request failed" })).toContainText("declined");
  expect(await page.evaluate(() => (window as Window & { signedParams?: unknown[] }).signedParams)).toEqual([
    stringToHex(message),
    identity.ownerWallet,
  ]);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert", { name: "Request failed" })).toContainText("declined");
});

test("login: unavailable configuration does not expose credential errors", async ({ page }) => {
  await page.addInitScript((wallet) => {
    Object.assign(window, { ethereum: { request: async () => [wallet] } });
  }, identity.ownerWallet);
  await page.route("**/api/auth/nonce", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "CONFIGURATION_ERROR" }, details: "PRIVATE_SERVER_CREDENTIAL" },
    }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert", { name: "Request failed" })).toContainText("not configured");
  await expect(page.locator("body")).not.toContainText("PRIVATE_SERVER_CREDENTIAL");
});

test("login: verification sends only nonce and signature and recovers from expiry", async ({ page }) => {
  const signature = `0x${"12".repeat(65)}`;
  await page.addInitScript(
    ({ wallet, signature }) => {
      Object.assign(window, {
        ethereum: {
          request: async ({ method }: { method: string }) =>
            method === "eth_requestAccounts" ? [wallet] : signature,
        },
      });
    },
    { wallet: identity.ownerWallet, signature },
  );
  await page.route("**/api/auth/nonce", (route) =>
    route.fulfill({
      json: {
        nonceId: identity.workspaceId,
        message: "Exact server login message",
        expiresAt: "2099-01-01T12:00:00Z",
      },
    }),
  );
  await page.route("**/api/auth/verify", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ nonceId: identity.workspaceId, signature });
    await route.fulfill({ status: 400, json: { error: { code: "NONCE_INVALID_OR_USED" } } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert", { name: "Request failed" })).toContainText(
    "expired or was already used",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("authenticated console (real encrypted cookie, mocked UI APIs)", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    expect(process.env.SESSION_ENCRYPTION_KEY).toBeTruthy();
    expect(process.env.CONNECTOR_TOKEN_PEPPER).toBeTruthy();
    expect(process.env.NEXT_PUBLIC_APP_URL).toBeTruthy();
    expect(baseURL, "Use the coordinator's baseURL fixture").toBeTruthy();
    expect(
      new URL(baseURL!).hostname,
      "Always-Secure __Host cookies require localhost secure context or local HTTPS",
    ).toBe("localhost");
    expect(new URL(process.env.NEXT_PUBLIC_APP_URL!).origin).toBe(new URL(baseURL!).origin);
    const token = await createSessionCodec({
      appOrigin: new URL(baseURL!).origin,
      chainId: Number(process.env.ARC_CHAIN_ID ?? "5042002"),
      sessionKey: new Uint8Array(Buffer.from(process.env.SESSION_ENCRYPTION_KEY!, "base64")),
    }).seal(identity);
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: baseURL!.replace("http:", "https:") + "/", secure: true, httpOnly: true, sameSite: "Lax" },
    ]);
  });

  test("server guard rejects a missing session", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("successful wallet login navigates using a real signed session cookie", async ({ page, context }) => {
    const cookie = (await context.cookies()).find((item) => item.name === SESSION_COOKIE)!;
    await context.clearCookies();
    const signature = `0x${"12".repeat(65)}`;
    await page.addInitScript(
      ({ wallet, signature }) => {
        Object.assign(window, {
          ethereum: {
            request: async ({ method }: { method: string }) =>
              method === "eth_requestAccounts" ? [wallet] : signature,
          },
        });
      },
      { wallet: identity.ownerWallet, signature },
    );
    await page.route("**/api/auth/nonce", (route) =>
      route.fulfill({
        json: {
          nonceId: identity.workspaceId,
          message: "Exact server login message",
          expiresAt: "2099-01-01T12:00:00Z",
        },
      }),
    );
    await page.route("**/api/auth/verify", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ nonceId: identity.workspaceId, signature });
      await route.fulfill({
        json: { session: identity },
        headers: {
          "Set-Cookie": `${SESSION_COOKIE}=${cookie.value}; Secure; HttpOnly; SameSite=Lax; Path=/`,
          "Cache-Control": "private, no-store",
        },
      });
    });
    await page.goto("/login");
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });

  test("honest overview, mobile account destinations, invoices, and actual logout", async ({
    page,
    context,
    isMobile,
  }, testInfo) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Claude", exact: true })).toHaveAttribute(
      "href",
      "https://claude.ai/new",
    );
    await expect(page.getByText("The ledger starts with a published invoice")).toBeVisible();
    await noOverflow(page);
    await testInfo.attach("overview", {
      body: await page.screenshot({ fullPage: true, path: testInfo.outputPath("overview.png") }),
      contentType: "image/png",
    });
    const nav = page.getByRole("navigation", {
      name: isMobile ? "Mobile workspace" : "Workspace",
      exact: true,
    });
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Invoices" }).click();
    await expect(page.getByRole("heading", { name: "Publication comes next" })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Account", exact: true })
        .getByRole("link", { name: "Connections" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Account", exact: true }).getByRole("link", { name: "Settings" }),
    ).toBeVisible();
    // Do not mock logout: this gate verifies the integrated route's actual cookie deletion.
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE)).toBe(false);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("profile revision conflict preserves edits and payout uses the exact signed flow", async ({
    page,
  }, testInfo) => {
    let profile = { ...initialProfile };
    let conflict = true;
    const newWallet = "0x2222222222222222222222222222222222222222";
    const message = `Payr payout change\nOld: ${profile.payoutWallet}\nNew: ${newWallet}`;
    const signature = `0x${"12".repeat(65)}`;
    await page.addInitScript(
      ({ wallet, signature }) => {
        Object.assign(window, {
          ethereum: {
            request: async ({ method, params }: { method: string; params?: unknown[] }) => {
              if (method === "eth_requestAccounts") return [wallet];
              Object.assign(window, { signedParams: params });
              return signature;
            },
          },
        });
      },
      { wallet: identity.ownerWallet, signature },
    );
    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        expect(input).not.toHaveProperty("payoutWallet");
        expect(input).not.toHaveProperty("ownerWallet");
        if (conflict) {
          conflict = false;
          profile = { ...profile, revision: 2, businessName: "Saved elsewhere" };
          await route.fulfill({ status: 409, json: { error: { code: "REVISION_CONFLICT" } } });
          return;
        }
        expect(input.expectedRevision).toBe(profile.revision);
        profile = { ...profile, ...input, revision: profile.revision + 1 };
      }
      await route.fulfill({ json: { profile } });
    });
    await page.route("**/api/auth/nonce", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        purpose: "payr-payout-change-v1",
        newPayoutWallet: newWallet,
        expectedRevision: profile.revision,
      });
      await route.fulfill({
        json: { nonceId: identity.workspaceId, message, expiresAt: "2099-01-01T12:00:00Z" },
      });
    });
    await page.route("**/api/auth/verify", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ nonceId: identity.workspaceId, signature });
      profile = { ...profile, payoutWallet: newWallet, revision: profile.revision + 1 };
      await route.fulfill({ json: { session: identity, profile } });
    });
    await page.goto("/app/settings");
    await page.getByLabel("Business name", { exact: true }).fill("My preserved edit");
    await page.getByRole("button", { name: "Save sender details" }).click();
    await expect(page.getByRole("alert", { name: "Request failed" })).toContainText("changed elsewhere");
    await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("My preserved edit");
    await page.getByRole("button", { name: "Review latest saved version" }).click();
    await expect(page.getByText("Saved elsewhere", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Use latest revision, keep my edits" }).click();
    await page.getByRole("button", { name: "Save sender details" }).click();
    await expect(page.getByText("Saved to your workspace.")).toBeVisible();
    await page.getByLabel("New payout wallet", { exact: true }).fill(newWallet);
    await page.getByRole("button", { name: "Review payout change" }).click();
    const review = page.locator(".payout-review");
    await expect(review).toContainText(initialProfile.payoutWallet);
    await expect(review).toContainText(newWallet);
    await page.getByRole("button", { name: "Sign payout change" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Payout wallet updated" })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { signedParams?: unknown[] }).signedParams)).toEqual(
      [stringToHex(message), identity.ownerWallet],
    );
    await noOverflow(page);
    await testInfo.attach("settings", {
      body: await page.screenshot({ fullPage: true, path: testInfo.outputPath("settings.png") }),
      contentType: "image/png",
    });
  });

  test("clients create and update use null then paired CAS fields", async ({ page }, testInfo) => {
    const clients: ClientProfile[] = [];
    await page.route("**/api/clients", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { clients } });
        return;
      }
      const input = route.request().postDataJSON();
      expect(input).not.toHaveProperty("provenance");
      expect(input.id).toBe(clients[0]?.id ?? null);
      expect(input.expectedRevision).toBe(clients[0]?.revision ?? null);
      const client = {
        ...input,
        id: "22222222-2222-4222-8222-222222222222",
        revision: (clients[0]?.revision ?? 0) + 1,
        provenance: {},
      };
      clients[0] = client;
      await route.fulfill({ json: { client } });
    });
    await page.goto("/app/clients");
    await page.getByRole("button", { name: "Add client" }).click();
    for (const [label, value] of Object.entries({
      "Client alias": "North",
      "Business name": "North Studio",
      "Contact name": "Sam",
      "Contact email": "sam@example.com",
      "Address line 1": address.line1,
      City: address.city,
      "Postal code": address.postalCode,
      "Country code (2 letters)": "GB",
    })) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByRole("heading", { name: "Edit North" })).toBeVisible();
    await page.getByLabel("Contact name", { exact: true }).fill("Sam Updated");
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Saved to your workspace.")).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Sam Updated");
    await noOverflow(page);
    await testInfo.attach("clients", {
      body: await page.screenshot({ fullPage: true, path: testInfo.outputPath("clients.png") }),
      contentType: "image/png",
    });
  });

  test("connection show-once, copy, acknowledgement, revoke, and redacted activity", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    let connectors: ConnectorMetadata[] = [];
    const token = `${connection.id}.${"x".repeat(43)}`;
    const endpointUrl = `${baseURL}/api/mcp/${token}`;
    await page.route("**/api/connectors", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { connectors } });
        return;
      }
      expect(route.request().postDataJSON()).toEqual({ expiresInDays: 1 });
      connectors = [connection];
      await route.fulfill({ json: { connector: connection, token, endpointUrl } });
    });
    await page.route(`**/api/connectors/${connection.id}/revoke`, async (route) => {
      connectors = [{ ...connection, revokedAt: "2026-09-06T13:00:00Z" }];
      await route.fulfill({ json: { connector: connectors[0] } });
    });
    await page.route("**/api/activity", (route) =>
      route.fulfill({
        json: {
          events: [
            {
              id: identity.workspaceId,
              action: "connector.revoke",
              outcome: "success",
              tokenId: connection.id,
              createdAt: connection.createdAt,
              token: "PRIVATE_TOKEN",
              requestBody: "PRIVATE_BODY",
            },
          ],
        },
      }),
    );
    await page.goto("/app/connections");
    await expect(page.getByRole("heading", { name: "Claude MCP is not available yet" })).toBeVisible();
    await expect(page.getByText(/Platform access logs, CDN logs/)).toBeVisible();
    await page.getByLabel("Expires in (days)", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Create credential" }).click();
    await expect(page.getByLabel("Credential", { exact: true })).toHaveValue(token);
    await page.getByRole("button", { name: "Copy endpoint URL" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(endpointUrl);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(
      token,
    );
    await page.getByRole("button", { name: "I have saved it, hide credential" }).click();
    await expect(page.getByLabel("Credential", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Active credential", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Credential", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Revoke credential", exact: true }).click();
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await expect(
      page.getByText("Connection revoked. Copies of the credential no longer grant access."),
    ).toBeVisible();
    await noOverflow(page);
    await testInfo.attach("connections-after-revoke", {
      body: await page.screenshot({ fullPage: true, path: testInfo.outputPath("connections.png") }),
      contentType: "image/png",
    });
    await page.goto("/app/activity");
    await expect(page.getByRole("table")).toContainText("Credential revoked");
    await expect(page.locator("body")).not.toContainText("PRIVATE_");
    await noOverflow(page);
  });

  test("tablet rail collapses without removing destinations", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto("/app");
    const rail = page.locator(".workspace-rail");
    expect((await rail.boundingBox())?.width).toBe(88);
    await expect(rail.getByRole("link", { name: "Connections" })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Settings" })).toBeVisible();
    await noOverflow(page);
  });
});

import { expect, test } from "@playwright/test";

test("public MCP guide separates discovery from private authentication without a plugin", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const response = await page.goto("/install");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Connect Payr to your agent." })).toBeVisible();
  await expect(page.getByText("Claude/Cowork workspace setup still needs verification.")).toBeVisible();
  const prompt = page.getByRole("textbox", { name: "Payr connection prompt" });
  await expect(prompt).toHaveValue(/Workspace access pending/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await page.locator("a:visible, button:visible, summary:visible").all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await testInfo.attach("install", { body: await page.screenshot({ fullPage: true, animations: "disabled", path: testInfo.outputPath("install.png") }), contentType: "image/png" });
  await page.getByRole("button", { name: "Copy setup prompt" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await prompt.inputValue());
  await expect(page.getByRole("status").filter({ hasText: "Copying does not connect your workspace" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.getByRole("main").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

test("MCP setup and its authentication warning remain readable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/install");
    await expect(page.getByRole("textbox", { name: "Payr connection prompt" })).toHaveValue(/Never ask me to paste credentials/);
    await expect(page.getByText("Claude/Cowork workspace setup still needs verification.")).toBeVisible();
    await page.getByRole("link", { name: "Open Payr Connections" }).click();
    await expect(page.getByRole("heading", { name: "Login to connect to your Payr dashboard" })).toBeVisible();
  } finally { await context.close(); }
});

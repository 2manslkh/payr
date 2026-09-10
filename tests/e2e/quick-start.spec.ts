import { expect, test } from "@playwright/test";

test("Bazantic quick start switches, copies, and fits the viewport", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const quickStart = page.getByRole("region", { name: "Connect Payr", exact: true });
  await expect(quickStart).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quick-start-hero.png") });

  for (const name of ["Claude / Cowork", "Claude Code", "Cursor", "ChatGPT / Codex", "Custom MCP", "CLI"]) {
    await quickStart.getByRole("tab", { name, exact: true }).click();
    const panel = quickStart.getByRole("tabpanel", { name, exact: true });
    await expect(panel).toBeVisible();
    const snippet = await panel.locator("code").innerText();
    await quickStart.getByRole("button", { name: "Copy setup snippet" }).click();
    await expect(quickStart.getByRole("status")).toHaveText("Setup snippet copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(snippet);
    expect(await quickStart.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    await quickStart.screenshot({ path: testInfo.outputPath(`quick-start-${name.toLowerCase().replace(/[^a-z]+/g, "-")}.png`) });
  }

  await quickStart.getByRole("tab", { name: "CLI", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(quickStart.getByRole("tab", { name: "Claude / Cowork", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(quickStart.getByRole("tab", { name: "CLI", exact: true })).toBeFocused();

  await page.setViewportSize({ width: 320, height: 740 });
  await quickStart.getByRole("tab", { name: "Cursor", exact: true }).click();
  expect(await quickStart.evaluate((element) => [...element.querySelectorAll("pre, p, [role=tablist]")].every((child) => child.scrollWidth <= child.clientWidth))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await quickStart.screenshot({ path: testInfo.outputPath("quick-start-narrow.png") });
});

test("default installation instructions remain readable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Connect Payr", exact: true }).locator("code")).toHaveText(
      "https://api.payrlink.xyz/mcp",
    );
  } finally {
    await context.close();
  }
});

import { expect, test } from "@playwright/test";

test("public install guide is readable without authentication and does not claim an available plugin", async ({ page }, testInfo) => {
  const response = await page.goto("/install");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Install Payr in your agent." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy installation prompt" })).toBeDisabled();
  await expect(page.getByText("The plugin is still being prepared.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await page.locator("a:visible, button:visible").all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await testInfo.attach("install", { body: await page.screenshot({ fullPage: true, animations: "disabled", path: testInfo.outputPath("install.png") }), contentType: "image/png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.getByRole("main").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

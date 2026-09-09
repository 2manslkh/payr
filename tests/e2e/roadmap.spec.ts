import { expect, test } from "@playwright/test";

test("roadmap presents four milestones and keyboard-operable motion controls", async ({ page }, testInfo) => {
  await page.goto("/#roadmap", { waitUntil: "domcontentloaded" });
  const roadmap = page.locator("#roadmap");
  await roadmap.scrollIntoViewIfNeeded();
  await expect(roadmap.locator("li")).toHaveCount(4);
  await expect(roadmap).toHaveAttribute("data-started", "true");
  await expect(roadmap.getByText(/^Planned \//)).toHaveCount(3);
  const pause = roadmap.getByRole("button", { name: "Pause motion" });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(roadmap).toHaveAttribute("data-paused", "true");
  expect(await roadmap.evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === "paused"))).toBe(true);
  await roadmap.getByRole("button", { name: "Replay" }).click();
  await expect(roadmap).toHaveAttribute("data-paused", "false");
  expect(await roadmap.evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
  await expect.poll(() => roadmap.evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === "finished")), { timeout: 10000 }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await roadmap.screenshot({ path: testInfo.outputPath("roadmap.png"), style: "nextjs-portal { visibility: hidden; }" });
});

test("roadmap responds immediately to reduced motion", async ({ page }) => {
  await page.goto("/#roadmap", { waitUntil: "domcontentloaded" });
  const roadmap = page.locator("#roadmap");
  await roadmap.scrollIntoViewIfNeeded();
  await expect(roadmap).toHaveAttribute("data-started", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(roadmap.getByRole("button", { name: "Pause motion" })).toBeHidden();
  expect(await roadmap.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(roadmap.getByRole("heading", { name: "Put invoices to work." })).toBeVisible();
});

test("roadmap remains readable without JavaScript at narrow widths", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#roadmap`, { waitUntil: "domcontentloaded" });
  const roadmap = page.locator("#roadmap");
  await expect(roadmap.locator("h3")).toHaveCount(4);
  await expect(roadmap).toContainText("Automatic receipt sending remains disabled");
  await expect(roadmap.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

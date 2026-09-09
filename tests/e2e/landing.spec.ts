import { expect, test } from "@playwright/test";

test("landing explains the problem, released capabilities, and live verification limits", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "From finished work to verified payment." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to Payr", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("heading", { name: "Shipping the work isn't the end of the work." })).toBeVisible();
  await expect(page.getByText("Receipt email is operator-controlled; automatic sending remains disabled.")).toBeVisible();
  await expect(page.locator("#roadmap").getByText(/Full live Claude and external-wallet acceptance checks remain outstanding/)).toBeVisible();
  await expect(page.getByText(/coming next|are in development/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator("[data-invoice-paper]").evaluateAll((papers) => papers.every((paper) => paper.scrollHeight <= paper.clientHeight + 1))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("landing-hero.png") });
  await page.getByRole("heading", { name: "You did the work. Give it a proper finish." }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('img[src*="payr-mascot"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("landing-full.png"), fullPage: true });
});

test("stage links work on wide desktop and short landscape viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  await expect(page.locator('[data-renderer="webgl"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: "Verify" }).click();
  await expect(page.getByRole("link", { name: "Verify", exact: true })).toHaveAttribute("aria-current", "step");
  await page.setViewportSize({ width: 667, height: 375 });
  await page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: "Make it official. Keep it protected." })).toBeInViewport({ ratio: 1 });
});

test("narrow screens and keyboard navigation retain usable controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.getByRole("link", { name: "Sign in to Payr", exact: true })).toBeVisible();
});

test("short desktop keeps workflow navigation and motion controls in view", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("link", { name: "See the workflow" }).click();
    await expect(page.locator('[data-renderer="webgl"]')).toBeVisible();
    await page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Workflow stages" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Turn off animation" })).toBeInViewport({ ratio: 1 });
  }
});

test("WebGL renders, can be disabled, and recovers safely from context loss", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /THREE|shader|WebGL/.test(message.text())) errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  await expect(page.locator('[data-renderer="webgl"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: "Verify" }).click();
  await expect(page.getByRole("link", { name: "Verify", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.locator("canvas")).toHaveAttribute("data-frame-state", "settled");
  await page.screenshot({ path: testInfo.outputPath("landing-workflow.png") });
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Turn off animation" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator('[data-renderer="static"]')).toBeVisible();
  await page.getByRole("button", { name: "Enable animation" }).click();
  await expect(page.locator('[data-renderer="webgl"]')).toBeVisible();
  await page.locator("canvas").evaluate((element: HTMLCanvasElement) => {
    element.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(page.locator('[data-renderer="static"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("scrolling advances the animated document while the scene stays in view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  const frame = page.locator('[data-renderer="webgl"]');
  await expect(frame).toBeVisible();
  const lettering = frame.locator('[data-invoice-label]');
  await expect(lettering).toBeVisible();
  let previous = await lettering.getAttribute("style");
  for (const [id, label] of [["publish-invoice", "Publish"], ["approve-payment", "Pay"], ["verify-settlement", "Verify"]]) {
    const delta = await page.locator(`#${id}`).evaluate((chapter) => {
      const bounds = chapter.getBoundingClientRect();
      return bounds.top + bounds.height / 2 - window.innerHeight * (window.innerWidth <= 720 ? 0.63 : 0.5);
    });
    await page.mouse.wheel(0, delta);
    await expect(page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "step");
    await expect.poll(() => lettering.getAttribute("style")).not.toBe(previous);
    await expect(frame).toBeInViewport({ ratio: 0.9 });
    previous = await lettering.getAttribute("style");
  }
});

test("workflow uses the requested title and finishes with a red PAID receipt", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  const frame = page.locator('[data-renderer="webgl"]');
  await expect(frame).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("data-frame-state", "settled");
  await expect(frame.locator("[data-invoice-label]")).toContainText("Service delivered.");
  await expect(frame.getByText("PAID", { exact: true })).toBeHidden();
  await frame.screenshot({ path: testInfo.outputPath("workflow-confirm.png") });

  await page.locator("#close-loop").evaluate((chapter) => {
    const bounds = chapter.getBoundingClientRect();
    window.scrollBy(0, bounds.top + bounds.height / 2 - window.innerHeight * (window.innerWidth <= 720 ? 0.63 : 0.5));
  });
  await expect(page.getByRole("link", { name: "Receipt", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.locator("canvas")).toHaveAttribute("data-frame-state", "settled");
  const receipt = frame.locator("[data-receipt-preview]");
  await expect(receipt).toBeVisible();
  await expect.poll(() => receipt.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.99);
  await expect(receipt.getByText("PAID", { exact: true })).toHaveCSS("color", "rgb(180, 35, 24)");
  await expect(frame.locator("[data-invoice-label]")).toBeHidden();
  await expect(receipt).toContainText("Illustrative receipt / Coming next");
  await frame.screenshot({ path: testInfo.outputPath("workflow-receipt.png") });
});

test("wallet preview scrolls from MetaMask Pay to a pressed button and verified check", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  const frame = page.locator('[data-renderer="webgl"]');
  await expect(frame).toBeVisible();
  const wallet = frame.locator("[data-wallet-preview]");
  for (const [progress, state] of [[2, "review"], [2.22, "clicked"], [3.2, "verified"]] as const) {
    await page.locator("[data-workflow-step]").evaluateAll((chapters, value) => {
      const index = Math.floor(value);
      const first = chapters[index].getBoundingClientRect();
      const second = chapters[index + 1].getBoundingClientRect();
      const position = first.top + first.height / 2 + (value - index) * (second.top + second.height / 2 - first.top - first.height / 2);
      window.scrollBy(0, position - innerHeight * (innerWidth <= 720 ? 0.63 : 0.5));
    }, progress);
    await expect(page.locator("canvas")).toHaveAttribute("data-frame-state", "settled");
    await expect(wallet).toHaveAttribute("data-payment-state", state);
    await expect(wallet).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(wallet).toHaveCSS("border-radius", "8px");
    if (state === "review") {
      await expect(wallet.locator("[data-wallet-contents]")).toHaveCSS("opacity", "1");
      await expect.poll(() => wallet.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(wallet.locator("[data-wallet-pay]")).toHaveText("Pay");
      await expect(wallet.locator("[data-wallet-check]")).toHaveCSS("opacity", "0");
    } else if (state === "clicked") {
      await expect.poll(() => wallet.evaluate((element) => Number(element.style.getPropertyValue("--wallet-press")))).toBeGreaterThan(0.99);
    } else {
      await expect(wallet.locator("[data-wallet-contents]")).toHaveCSS("opacity", "0");
      await expect(wallet.locator("[data-wallet-check]")).toHaveCSS("opacity", "1");
      await expect(wallet.locator("[data-wallet-check]")).toHaveCSS("color", "rgb(7, 27, 59)");
    }
    await frame.screenshot({ path: testInfo.outputPath(`wallet-${state}.png`) });
  }
  expect(await wallet.locator("button, a, input").count()).toBe(0);
});

test("reduced motion retains static art and navigable workflow chapters", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  await expect(page.locator('[data-renderer="static"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link", { name: "Verify" }).click();
  await expect(page).toHaveURL(/#verify-settlement$/);
  await expect(page.getByRole("heading", { name: "Not just sent. Verified and matched." })).toBeInViewport();
});

test("WebGL failure preserves content and sign-in", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("link", { name: "See the workflow" }).click();
  await expect(page.getByText("Static illustration", { exact: true })).toBeVisible();
  await expect(page.locator('[data-renderer="static"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with the facts. Not a blank invoice." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to Payr", exact: true })).toHaveAttribute("href", "/login");
});

test("the landing remains usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole("heading", { name: "From finished work to verified payment." })).toBeVisible();
  await expect(page.locator('[data-renderer="static"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workflow stages" }).getByRole("link")).toHaveCount(5);
  await page.getByRole("link", { name: "Sign in to Payr", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

import { expect, test } from "@playwright/test";

test("renders the Payr product promise", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Invoice. Settle. Reconcile." })).toBeVisible();
});

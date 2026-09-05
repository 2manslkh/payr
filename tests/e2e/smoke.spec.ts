import { expect, test } from "@playwright/test";

test("renders the Payr product promise", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Invoice. Settle. Reconcile." })).toBeVisible();
});

test("exposes only the public health contract", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.ok()).toBe(true);
  expect(body.status).toBe("ok");
  expect(body.commit === null || typeof body.commit === "string").toBe(true);
  expect(Object.keys(body).sort()).toEqual(["commit", "status"]);
});

import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test("public discovery is served with real connection metadata and exact skill bytes", async ({ request }) => {
  const auth = await request.get("/auth.md");
  expect(auth.status()).toBe(200);
  expect(await auth.text()).toMatch(/^# .*auth\.md$/m);
  const card = await (await request.get("/.well-known/mcp/server-card.json")).json();
  expect(new URL(card.remotes[0].url).pathname).toBe("/api/mcp");
  const legacy = await (await request.get("/.well-known/mcp.json")).json();
  expect(legacy.serverInfo.name).toBe("Payr");
  expect(legacy.endpoint).toBe(card.remotes[0].url);
  const denied = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(denied.status()).toBe(401);
  expect(denied.headers()["www-authenticate"]).toBe('Bearer realm="Payr"');
  expect(denied.headers()["cache-control"]).toContain("no-store");
  const index = await (await request.get("/.well-known/agent-skills/index.json")).json();
  const skill = await request.get("/.well-known/agent-skills/payr-create-invoice/SKILL.md");
  expect(index.skills[0].digest).toBe(`sha256:${createHash("sha256").update(await skill.body()).digest("hex")}`);
});

for (const owner of ["document", "navigator"] as const) {
  test(`homepage registers and executes read-only WebMCP tools using ${owner}`, async ({ page }) => {
    await page.addInitScript((owner) => {
      const tools = new Map();
      const modelContext = {
        registerTool(tool: { name: string }, options?: { signal: AbortSignal }) {
          tools.set(tool.name, tool);
          options?.signal.addEventListener("abort", () => tools.delete(tool.name));
        },
        unregisterTool(name: string) { tools.delete(name); },
      };
      Object.defineProperty(document, "modelContext", { configurable: true, value: owner === "document" ? modelContext : undefined });
      Object.defineProperty(navigator, "modelContext", { configurable: true, value: owner === "navigator" ? modelContext : undefined });
      Object.defineProperty(window, "__payrPublicTools", { value: tools });
    }, owner);
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => [...(window as unknown as { __payrPublicTools: Map<string, unknown> }).__payrPublicTools.keys()])).toEqual([
      "get_payr_setup_instructions", "get_payr_capabilities",
    ]);
    const requests: string[] = [];
    // Lazy artwork may still load; tool calls must not read private APIs or mutate anything.
    page.on("request", (request) => {
      if (request.method() !== "GET" || new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.method());
    });
    const results = await page.evaluate(async () => {
      const tools = (window as unknown as { __payrPublicTools: Map<string, { execute(input: object): Promise<unknown> }> }).__payrPublicTools;
      return Promise.all([...tools.values()].map((tool) => tool.execute({})));
    });
    expect(JSON.stringify(results)).toContain("# Payr auth.md");
    expect(JSON.stringify(results)).toContain("Arc Testnet");
    expect(JSON.stringify(results)).toContain("Authorization: Bearer");
    expect(requests).toEqual([]);
    await page.getByRole("link", { name: "Sign in to Payr", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __payrPublicTools: Map<string, unknown> }).__payrPublicTools.size)).toBe(0);
  });
}

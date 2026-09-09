// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { apiMarkdown, authMarkdown, discoveryOrigin } from "./discovery";
import { GET as robots } from "../app/robots.txt/route";
import sitemap from "../app/sitemap";
import { GET as discovery, OPTIONS as discoveryOptions } from "../app/.well-known/[...discovery]/route";
import { GET as openapi } from "../app/openapi.json/route";
import { mcpServerInfo } from "./mcp/info";
import { GET as markdown } from "../app/index.md/route";

afterEach(() => vi.unstubAllEnvs());

it("documents opt-in sender authority separately from invoice-only connections", () => {
  for (const text of [apiMarkdown, authMarkdown]) {
    expect(text).toContain("get_sender_profile");
    expect(text).toContain("save_sender_profile");
    expect(text).toContain("sender:read");
    expect(text).toContain("sender:write");
    expect(text).toContain("invoice-only");
  }
});

it("allows public card browser preflights without credentials", () => {
  const response = discoveryOptions();
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type, If-None-Match");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
});

const get = (resource: string) => discovery(new Request(`https://untrusted.test/.well-known/${resource}`), {
  params: Promise.resolve({ discovery: resource.split("/") }),
});

it("publishes an explicit Markdown alternate with truthful product limitations", async () => {
  const response = markdown();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  expect(await response.text()).toContain("automatic sending remains disabled");
});

it("uses only a validated canonical origin and a public sitemap allowlist", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test/");
  expect(sitemap()).toEqual([{ url: "https://canonical.test/" }]);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test/private?secret=yes");
  expect(discoveryOrigin).toThrow();
});

it("declares search-only usage and repeats private exclusions for specific search bots", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test");
  const response = robots();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  const text = await response.text();
  expect(text).toContain("Content-Signal: search=yes, ai-train=no, ai-input=no");
  expect(text).toContain("Sitemap: https://canonical.test/sitemap.xml");
  for (const agent of ["*", "OAI-SearchBot", "Claude-SearchBot"]) {
    const group = text.split("\n\n").find((entry) => entry.startsWith(`User-agent: ${agent}\n`));
    for (const path of ["/app", "/login", "/invoice/", "/receipt/", "/api/", "/dev/"]) expect(group).toContain(`Disallow: ${path}`);
  }
  for (const agent of ["GPTBot", "Claude-Web", "ClaudeBot", "Google-Extended"]) expect(text).toContain(`User-agent: ${agent}\nDisallow: /`);
});

it("hashes the exact published skill bytes rather than a duplicate copy", async () => {
  const index = await (await get("agent-skills/index.json")).json();
  const artifact = await get("agent-skills/payr-create-invoice/SKILL.md");
  expect(artifact.status).toBe(200);
  expect(artifact.headers.get("content-type")).toContain("text/markdown");
  const bytes = Buffer.from(await artifact.arrayBuffer());
  expect(index.$schema).toContain("/0.2.0/schema.json");
  expect(index.skills[0].digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  expect(bytes.toString()).toContain("explicit approval");
});

it("catalogs only the real public health API and links its description and docs", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test");
  const response = await get("api-catalog");
  expect(response.headers.get("content-type")).toContain("application/linkset+json");
  expect(response.headers.get("link")).toContain('rel="api-catalog"');
  const { linkset } = await response.json();
  expect(linkset[0].anchor).toBe("https://canonical.test/api/health");
  expect(linkset[0]["service-desc"][0].href).toBe("https://canonical.test/openapi.json");
  expect(Object.keys((await openapi().json()).paths)).toEqual(["/api/health"]);
});

it("publishes current discovery formats without private endpoints or fake OAuth", async () => {
  const card = await (await get("mcp/server-card.json")).json();
  expect(card.version).toBe(mcpServerInfo.version);
  expect(card.remotes).toBeUndefined();
  expect(card.websiteUrl).toContain("/docs/api.md");
  for (const resource of ["ai-catalog.json", "ard.json"]) {
    const response = await get(resource);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toBe(resource === "ai-catalog.json" ? "application/ai-catalog+json" : "application/json");
    const manifest = await response.json();
    expect(manifest.entries).toHaveLength(2);
    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(/^urn:air:/);
      expect(entry.url).toBeTruthy();
      expect(entry.data).toBeUndefined();
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.url).not.toContain("/api/mcp/");
    }
  }
  for (const resource of ["openid-configuration", "oauth-authorization-server", "oauth-protected-resource", "unknown"]) {
    expect((await get(resource)).status).toBe(404);
  }
});

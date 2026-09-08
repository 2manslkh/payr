import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoveryOrigin } from "../../../lib/discovery";
import { mcpServerInfo } from "../../../lib/mcp/info";

export async function GET(_request: Request, context: { params: Promise<{ discovery: string[] }> }) {
  const resource = (await context.params).discovery.join("/");
  const origin = discoveryOrigin();
  const headers = new Headers({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "X-Content-Type-Options": "nosniff" });
  const skillUrl = `${origin}/.well-known/agent-skills/payr-create-invoice/SKILL.md`;
  if (resource === "agent-skills/index.json" || resource === "agent-skills/payr-create-invoice/SKILL.md") {
    const skill = await readFile(path.join(process.cwd(), "skills/payr-create-invoice/SKILL.md"));
    if (resource.endsWith("SKILL.md")) {
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      return new Response(new Uint8Array(skill), { headers });
    }
    return Response.json({
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [{ name: "payr-create-invoice", type: "skill-md", description: "Draft, explicitly approve publication, check status, and explicitly void Payr invoices using an authenticated connector.", url: skillUrl, digest: `sha256:${createHash("sha256").update(skill).digest("hex")}` }],
    }, { headers });
  }
  if (resource === "api-catalog") {
    headers.set("Content-Type", 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
    headers.set("Link", `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`);
    return Response.json({ linkset: [{
      anchor: `${origin}/api/health`,
      "service-desc": [{ href: `${origin}/openapi.json`, type: "application/json" }],
      "service-doc": [{ href: `${origin}/docs/api.md`, type: "text/markdown" }],
      status: [{ href: `${origin}/api/health`, type: "application/json" }],
    }] }, { headers });
  }
  if (resource === "mcp/server-card.json") {
    headers.set("Content-Type", "application/mcp-server-card+json");
    headers.set("Access-Control-Expose-Headers", "ETag");
    return Response.json({
      $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
      name: "xyz.payrlink/payr", version: mcpServerInfo.version,
      description: "Workspace-scoped Payr invoice tools on Arc Testnet. Human connector setup required.",
      websiteUrl: `${origin}/docs/api.md`,
    }, { headers });
  }
  if (resource === "ai-catalog.json" || resource === "ard.json") {
    if (resource === "ai-catalog.json") headers.set("Content-Type", "application/ai-catalog+json");
    const entries = [{
      identifier: `urn:air:${new URL(origin).hostname}:skill:payr-create-invoice`,
      displayName: "Payr Invoice Workflow", type: "text/markdown", url: skillUrl,
      representativeQueries: ["How do I draft a Payr USDC invoice?", "How do I approve publication of an invoice?", "How do I check invoice settlement status?"],
    }, {
      identifier: `urn:air:${new URL(origin).hostname}:mcp:payr`,
      displayName: "Payr MCP Connector", type: "application/mcp-server-card+json", url: `${origin}/.well-known/mcp/server-card.json`,
      representativeQueries: ["How do I connect an assistant to Payr?", "Which invoice tools does Payr expose?"],
    }];
    return Response.json(resource === "ard.json" ? { entries } : {
      specVersion: "1.0", host: { displayName: "Payr", identifier: new URL(origin).hostname }, entries,
    }, { headers });
  }
  return new Response(null, { status: 404 });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  } });
}

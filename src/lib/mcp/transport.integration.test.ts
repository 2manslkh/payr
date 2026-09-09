import { fixtureDatabaseContainer } from "../../../scripts/local-test-config.mjs";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createConnectorAuthenticator } from "../connectors/auth";
import { createConnectorHasher } from "../connectors/crypto";
import { createIdentityRepository } from "../db/identity";
import { normalizeIp } from "../security/ip";
import { handleMcpRequest } from "./transport";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repository = createIdentityRepository(db);
const config = { appOrigin: "https://example.test", chainId: 5042002,
  sessionKey: randomBytes(32), connectorPepper: randomBytes(32) };
const hash = createConnectorHasher(config.connectorPepper);

// Local SQL only arranges fixture rows; every admission traverses HTTP handling and the real repository.
function sql(input: string) {
  return execFileSync("docker", ["exec", "-i", fixtureDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function fixture() {
  const owner = { workspaceId: randomUUID(), ownerWallet: `0x${randomBytes(20).toString("hex")}` };
  sql(`insert into public.workspaces (id,owner_wallet) values ('${owner.workspaceId}','${owner.ownerWallet}');`);
  const id = randomUUID(), token = `${id}.${randomBytes(32).toString("base64url")}`;
  const tokenHash = hash("connector", token);
  await repository.createConnector(owner, { id, tokenHash, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const ip = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;
  const ipHash = hash("connector-ip", normalizeIp(ip)!);
  const services = { createDraft: vi.fn(), publish: vi.fn(), status: vi.fn(), void: vi.fn(), getSenderProfile: vi.fn(), saveSenderProfile: vi.fn() };
  const runtime = { ...createConnectorAuthenticator(repository, config), services, appOrigin: config.appOrigin };
  const send = (body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" }, address = ip) =>
    handleMcpRequest(new Request(`${config.appOrigin}/api/mcp/${token}`, { method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    }), token, address, runtime);
  return { owner, id, token, tokenHash, ip, ipHash, services, send };
}

async function avoidMinuteBoundary() {
  const seconds = Number(sql("select extract(second from clock_timestamp());"));
  if (seconds > 45) await new Promise((resolve) => setTimeout(resolve, (60 - seconds) * 1000 + 50));
}

describe("MCP endpoint admission through the real identity database", () => {
  it.each(["token", "ip"] as const)("exhausts and recovers the independent %s bucket", async (bucket) => {
    const a = await fixture(), b = await fixture();
    await avoidMinuteBoundary();
    if (bucket === "token") {
      sql(`insert into public.connector_rate_limits (workspace_id,connector_token_id,purpose,subject_hash,window_started_at,request_count)
        values ('${a.owner.workspaceId}','${a.id}','token','${a.tokenHash}',date_trunc('minute',clock_timestamp()),59);`);
    } else {
      sql(`insert into public.connector_ip_rate_limits (subject_hash,window_started_at,request_count)
        values ('${a.ipHash}',date_trunc('minute',clock_timestamp()),119);`);
    }
    expect((await a.send()).status).toBe(200);
    const lastUsed = (await repository.findConnector(a.id))!.lastUsedAt;
    // Token exhaustion follows the token across IPs; IP exhaustion follows the IP across workspaces.
    const denied = bucket === "token" ? await a.send(undefined, b.ip) : await b.send(undefined, a.ip);
    expect(denied.status).toBe(429);
    const retry = Number(denied.headers.get("retry-after"));
    expect(Number.isInteger(retry) && retry >= 1 && retry <= 60).toBe(true);
    expect(await denied.json()).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limited" } });
    expect((await repository.findConnector(a.id))!.lastUsedAt).toBe(lastUsed);
    expect((await repository.findConnector(b.id))!.lastUsedAt).toBeNull();
    expect(sql(`select count(*) from public.connector_rate_limits where connector_token_id = '${b.id}';`)).toBe("0");
    expect(sql(`select count(*) from public.connector_ip_rate_limits where subject_hash = '${b.ipHash}';`)).toBe("0");
    expect(sql(bucket === "token"
      ? `select request_count from public.connector_rate_limits where connector_token_id = '${a.id}';`
      : `select request_count from public.connector_ip_rate_limits where subject_hash = '${a.ipHash}';`)).toBe(bucket === "token" ? "60" : "120");
    expect((await b.send()).status).toBe(200);
    // Advance only the exhausted fixture window, leaving the other bucket active.
    sql(bucket === "token"
      ? `update public.connector_rate_limits set window_started_at = window_started_at - interval '1 minute' where connector_token_id = '${a.id}';`
      : `update public.connector_ip_rate_limits set window_started_at = window_started_at - interval '1 minute' where subject_hash = '${a.ipHash}';`);
    expect((await a.send()).status).toBe(200);
    expect(sql(bucket === "token"
      ? `select request_count from public.connector_rate_limits where connector_token_id = '${a.id}' and window_started_at = date_trunc('minute',clock_timestamp());`
      : `select request_count from public.connector_ip_rate_limits where subject_hash = '${a.ipHash}' and window_started_at = date_trunc('minute',clock_timestamp());`)).toBe("1");
    const events = await repository.listActivity(bucket === "token" ? a.owner : b.owner);
    expect(events).toContainEqual(expect.objectContaining({ action: "invoice:status", outcome: "rate_limited", tokenId: bucket === "token" ? a.id : b.id }));
    for (const service of Object.values(a.services)) expect(service).not.toHaveBeenCalled();
    for (const service of Object.values(b.services)) expect(service).not.toHaveBeenCalled();
  }, 30_000);

  it.each(["expiry", "revocation"] as const)("denies discovery and calls at %s without dispatch or credential leakage", async (kind) => {
    const f = await fixture();
    expect((await f.send()).status).toBe(200);
    const lastUsed = (await repository.findConnector(f.id))!.lastUsedAt;
    if (kind === "expiry") {
      // Exact database-time expiry, not a rounded future deadline or a mocked JS clock.
      sql(`update public.connector_tokens set expires_at = clock_timestamp() where id = '${f.id}';`);
    } else {
      await repository.revokeConnector(f.owner, f.id);
    }
    for (const body of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: f.token, version: "1" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "publish_invoice", arguments: { secret: f.token } } },
    ]) {
      const response = await f.send(body);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await response.json()).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Connector unavailable" } });
    }
    expect((await repository.findConnector(f.id))!.lastUsedAt).toBe(lastUsed);
    expect(sql(`select request_count from public.connector_rate_limits where connector_token_id = '${f.id}';`)).toBe("1");
    for (const service of Object.values(f.services)) expect(service).not.toHaveBeenCalled();
    const events = await repository.listActivity(f.owner);
    expect(events.filter((event) => event.outcome === "denied").map((event) => event.action).sort())
      .toEqual(["invoice:publish", "invoice:status", "invoice:status"]);
    expect(events.every((event) => Object.keys(event).sort().join() === "action,createdAt,id,outcome,tokenId")).toBe(true);
    const stored = await db.from("audit_events").select("*").eq("workspace_id", f.owner.workspaceId);
    expect(stored.error).toBeNull();
    for (const secret of [f.token, f.tokenHash, f.ip, f.ipHash, "/api/mcp/", "arguments", "clientInfo"]) {
      expect(JSON.stringify(stored.data).includes(secret) || JSON.stringify(events).includes(secret)).toBe(false);
    }
  });

  it("maps hostile tool names to a bounded audit action after real admission", async () => {
    const f = await fixture();
    const response = await f.send({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: `${config.appOrigin}/api/mcp/${f.token}`, arguments: { body: f.token } } });
    expect(response.status).toBe(200);
    expect((await response.json()).result.structuredContent).toEqual({ code: "INVALID_INPUT" });
    const events = await repository.listActivity(f.owner);
    expect(events).toContainEqual(expect.objectContaining({ action: "invoice:status", outcome: "allowed", tokenId: f.id }));
    expect(JSON.stringify(events).includes(f.token)).toBe(false);
    for (const service of Object.values(f.services)) expect(service).not.toHaveBeenCalled();
  });
});

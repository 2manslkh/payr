import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { IdentityError } from "../identity/contracts";
import type { createConnectorAuthenticator } from "../connectors/auth";
import { createMcpServer, toolActions, type McpServices } from "./server";

export type McpRuntime = { authenticate: ReturnType<typeof createConnectorAuthenticator>["authenticate"]; services: McpServices; appOrigin: string };
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" };
function failure(status: number, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });
}

export async function handleMcpRequest(request: Request, token: string, ip: string, runtime: McpRuntime): Promise<Response> {
  let body: unknown, bodyError = false, oversized = false, timedOut = false;
  // Read a bounded envelope without allowing SDK JSON/parser errors to echo input.
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!reader) throw new Error();
      // Bound total read time, not just bytes or the interval between chunks.
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error()); }, 5000);
      });
      let size = 0, text = "";
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        size += value.byteLength;
        if (size > 68 * 1024) { oversized = true; void reader.cancel().catch(() => {}); throw new Error(); }
        text += decoder.decode(value, { stream: true });
      }
      body = JSON.parse(text + decoder.decode());
    } catch { bodyError = true; void reader?.cancel().catch(() => {}); }
    finally { clearTimeout(timer); reader?.releaseLock(); }
  }
  const message = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const params = message?.params && typeof message.params === "object" ? message.params as Record<string, unknown> : null;
  const name = message?.method === "tools/call" && typeof params?.name === "string" ? params.name : "";
  // Protocol admission uses the existing invoice read scope; calls consume their
  // actual action once, including the separately opted-in sender actions.
  const action = Object.hasOwn(toolActions, name) ? toolActions[name as keyof typeof toolActions] : "invoice:status";
  let identity;
  try { identity = await runtime.authenticate({ token, ip, action }); }
  catch (error) {
    if (error instanceof IdentityError && error.code === "RATE_LIMITED") {
      const response = failure(429, -32000, "Rate limited");
      response.headers.set("Retry-After", String(error.retryAfterSeconds)); return response;
    }
    return error instanceof IdentityError && error.code === "CONNECTOR_INVALID"
      ? failure(401, -32000, "Connector unavailable") : failure(503, -32603, "Service unavailable");
  }
  if (new URL(request.url).origin !== runtime.appOrigin || (request.headers.has("origin") && request.headers.get("origin") !== runtime.appOrigin)) return failure(403, -32000, "Origin not allowed");
  if (request.method !== "POST") {
    const response = failure(405, -32000, "Only POST is supported; no SSE stream or session resume");
    response.headers.set("Allow", "POST"); return response;
  }
  if (request.headers.has("mcp-session-id") || request.headers.has("last-event-id")) return failure(400, -32000, "Sessions and resume are unsupported");
  if (oversized) return failure(413, -32600, "Request too large");
  if (timedOut) return failure(408, -32600, "Request body timed out");
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
    || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) return failure(415, -32600, "JSON required");
  if (bodyError) return failure(400, -32700, "Parse error");
  if (!message || (message.method === "tools/call" && message.id === undefined)) return failure(400, -32600, "Invalid request; batching is unsupported");
  const server = createMcpServer({ workspaceId: identity.workspaceId, connectorId: identity.tokenId, ownerWallet: null }, runtime.services);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const safeHeaders = new Headers({ "Content-Type": "application/json", Accept: request.headers.get("accept") ?? "" });
    const version = request.headers.get("mcp-protocol-version");
    if (version) safeHeaders.set("mcp-protocol-version", version);
    // Neither requestInfo nor SDK error callbacks receive the credential URL.
    const safeRequest = new Request("https://payr.invalid/mcp", { method: "POST", headers: safeHeaders, signal: request.signal });
    const response = await transport.handleRequest(safeRequest, { parsedBody: body });
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
    if (response.status === 202) return new Response(null, { status: 202, headers: responseHeaders });
    const result = await response.json();
    if (result.error) result.error = { code: result.error.code, message: "MCP request rejected" };
    return Response.json(result, { status: response.status, headers: responseHeaders });
  } catch { return failure(503, -32603, "Service unavailable"); }
  finally { await server.close().catch(() => {}); await transport.close().catch(() => {}); }
}

// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { CONNECTOR_SCOPES, IdentityError, type IdentityRepository, type SaveClientInput, type SaveSenderInput } from "../../../lib/identity/contracts";
import { GET, POST } from "./route";
import { GET as getClients, POST as saveClient } from "../clients/route";
import { GET as getConnectors, POST as createConnector } from "../connectors/route";
import { POST as revokeConnector } from "../connectors/[id]/revoke/route";
import { GET as getActivity } from "../activity/route";

// The auth lane owns session decryption, origin checks, and HTTP error rendering.
vi.mock("../../../lib/auth/runtime", () => ({
  requireRequestSession: vi.fn(),
  getIdentityRuntime: vi.fn(),
  privateJson: vi.fn((data: unknown) => Response.json(data)),
  apiError: vi.fn(() => new Response(null, { status: 500 })),
}));

const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` };
const foreignId = "00000000-0000-4000-8000-000000000002";
const config = {
  appOrigin: "https://payrlink.xyz", chainId: 5042002,
  sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
};
const senderInput: SaveSenderInput = {
  expectedRevision: 1, businessName: "Example Studio", contactName: "Owner", contactEmail: "owner@example.com",
  billingAddress: { line1: "1 Main St", city: "London", postalCode: "SW1A 1AA", countryCode: "GB" },
  invoicePrefix: "INV", defaultPaymentTermsDays: 30,
};
const clientInput: SaveClientInput = {
  id: null, expectedRevision: null, alias: "example", businessName: "Client Studio", contactName: "Client",
  contactEmail: "client@example.com", billingAddress: senderInput.billingAddress,
};
const profile = {
  id: identity.workspaceId, revision: 2, businessName: senderInput.businessName,
  billingAddress: senderInput.billingAddress, contactName: senderInput.contactName, contactEmail: senderInput.contactEmail,
  payoutWallet: identity.ownerWallet, invoicePrefix: "INV", defaultPaymentTermsDays: 30,
};
const client = {
  id: foreignId, revision: 1, alias: clientInput.alias, businessName: clientInput.businessName,
  contactName: clientInput.contactName, contactEmail: clientInput.contactEmail, billingAddress: clientInput.billingAddress,
  provenance: { businessName: { kind: "user_provided" as const, confirmed: true as const } },
};
const connector = {
  id: foreignId, createdAt: "2026-09-05T00:00:00.000Z", expiresAt: "2026-09-06T00:00:00.000Z",
  revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES,
};
const repository = {
  getProfile: vi.fn<IdentityRepository["getProfile"]>(),
  saveProfile: vi.fn<IdentityRepository["saveProfile"]>(),
  listClients: vi.fn<IdentityRepository["listClients"]>(),
  saveClient: vi.fn<IdentityRepository["saveClient"]>(),
  listConnectors: vi.fn<IdentityRepository["listConnectors"]>(),
  createConnector: vi.fn<IdentityRepository["createConnector"]>(),
  revokeConnector: vi.fn<IdentityRepository["revokeConnector"]>(),
  listActivity: vi.fn<IdentityRepository["listActivity"]>(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRequestSession).mockResolvedValue(identity);
  vi.mocked(getIdentityRuntime).mockReturnValue({ config, repository: repository as unknown as IdentityRepository });
  repository.getProfile.mockResolvedValue(profile);
  repository.saveProfile.mockResolvedValue(profile);
  repository.listClients.mockResolvedValue([client]);
  repository.saveClient.mockResolvedValue(client);
  repository.listConnectors.mockResolvedValue([connector]);
  repository.createConnector.mockImplementation(async (_identity, input) => ({ ...connector, id: input.id, expiresAt: input.expiresAt }));
  repository.revokeConnector.mockResolvedValue({ ...connector, revokedAt: "2026-09-05T12:00:00.000Z" });
  repository.listActivity.mockResolvedValue([]);
});

function post(body: unknown, path = "/api/profile") {
  return new Request(`${config.appOrigin}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function expectFailure(response: Response, code: string, status: number) {
  expect(apiError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code, status }));
  expect(response).toBe(vi.mocked(apiError).mock.results[0].value);
  expect(privateJson).not.toHaveBeenCalled();
}

it("reads the sender profile using only the independently authorized session", async () => {
  const request = new Request(`${config.appOrigin}/api/profile?workspaceId=${foreignId}`);
  const response = await GET(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request);
  expect(repository.getProfile).toHaveBeenCalledExactlyOnceWith(identity);
  expect(privateJson).toHaveBeenCalledExactlyOnceWith({ profile });
  expect(response).toBe(vi.mocked(privateJson).mock.results[0].value);
});

it("saves the strict sender schema and delegates write-origin authorization to the runtime", async () => {
  const request = post({ ...senderInput, businessName: "  Example Studio  ", contactEmail: "OWNER@EXAMPLE.COM" });
  const response = await POST(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  expect(repository.saveProfile).toHaveBeenCalledExactlyOnceWith(identity, senderInput);
  expect(await response.json()).toEqual({ profile });
});

it("rejects payout injection before touching the repository", async () => {
  const response = await POST(post({ ...senderInput, payoutWallet: `0x${"2".repeat(40)}` }));
  expectFailure(response, "INVALID_INPUT", 400);
  expect(repository.saveProfile).not.toHaveBeenCalled();
});

it("lists clients under the session scope without accepting query identity", async () => {
  const request = new Request(`${config.appOrigin}/api/clients?workspaceId=${foreignId}&ownerWallet=attacker`);
  const response = await getClients(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request);
  expect(repository.listClients).toHaveBeenCalledExactlyOnceWith(identity);
  expect(privateJson).toHaveBeenCalledExactlyOnceWith({ clients: [client] });
  expect(await response.json()).toEqual({ clients: [client] });
});

it("saves client billing fields while leaving provenance creation to the repository transaction", async () => {
  const request = post(clientInput, "/api/clients");
  const response = await saveClient(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  expect(repository.saveClient).toHaveBeenCalledExactlyOnceWith(identity, clientInput);
  expect(privateJson).toHaveBeenCalledExactlyOnceWith({ client });
  expect(await response.json()).toEqual({ client });
});

it("passes a foreign client id only under the session scope and preserves the repository denial", async () => {
  repository.saveClient.mockRejectedValue(new IdentityError("NOT_FOUND", 404));
  const input = { ...clientInput, id: foreignId, expectedRevision: 1 };
  const response = await saveClient(post(input, "/api/clients"));
  expect(repository.saveClient).toHaveBeenCalledExactlyOnceWith(identity, input);
  expectFailure(response, "NOT_FOUND", 404);
});

it("lists only connector metadata, including revoked and expired state, never credentials", async () => {
  const revoked = { ...connector, revokedAt: "2026-09-05T12:00:00.000Z" };
  const stored = { ...revoked, tokenHash: "secret-hash", token: "secret-token", endpointUrl: "secret-url" };
  repository.listConnectors.mockResolvedValue([stored]);
  const request = new Request(`${config.appOrigin}/api/connectors?workspaceId=${foreignId}`);
  const response = await getConnectors(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request);
  expect(repository.listConnectors).toHaveBeenCalledExactlyOnceWith(identity);
  expect(privateJson).toHaveBeenCalledExactlyOnceWith({ connectors: [revoked] });
  expect(await response.json()).toEqual({ connectors: [revoked] });
});

it("creates a connector with the real service and exposes the credential only in the creation envelope", async () => {
  const request = post({ expiresInDays: 7 }, "/api/connectors");
  const response = await createConnector(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  const result = await response.json();
  expect(Object.keys(result).sort()).toEqual(["connector", "endpointUrl", "token"]);
  expect(result.token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  expect(result.endpointUrl).toBe(`${config.appOrigin}/api/mcp/${result.token}`);
  expect(repository.createConnector).toHaveBeenCalledExactlyOnceWith(identity, {
    id: result.connector.id, tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/), expiresAt: result.connector.expiresAt,
  });
  expect(JSON.stringify(repository.createConnector.mock.calls)).not.toContain(result.token);
  expect(privateJson).toHaveBeenCalledExactlyOnceWith(result);
});

it("awaits the revoke UUID and returns metadata under the session scope", async () => {
  const request = post({ workspaceId: foreignId }, `/api/connectors/${foreignId}/revoke`);
  const response = await revokeConnector(request, { params: Promise.resolve({ id: foreignId }) });
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  expect(repository.revokeConnector).toHaveBeenCalledExactlyOnceWith(identity, foreignId);
  expect(await response.json()).toEqual({ connector: { ...connector, revokedAt: "2026-09-05T12:00:00.000Z" } });
});

it("lists no more than 100 newest audit metadata rows without exposing extra payloads", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: String(index), tokenId: connector.id, action: "connector_created", outcome: "allowed",
    createdAt: new Date(Date.UTC(2026, 8, 5, 0, 0, index)).toISOString(),
  }));
  repository.listActivity.mockResolvedValue(rows.map((row) => ({ ...row, token: "secret", ip: "192.0.2.128", payload: senderInput })));
  const request = new Request(`${config.appOrigin}/api/activity?workspaceId=${foreignId}`);
  const response = await getActivity(request);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request);
  expect(repository.listActivity).toHaveBeenCalledExactlyOnceWith(identity);
  expect(await response.json()).toEqual({ events: [...rows].reverse().slice(0, 100) });
});

const routes = [
  { path: "/api/profile", method: "GET", handler: GET, operation: "getProfile" },
  { path: "/api/profile", method: "POST", handler: POST, operation: "saveProfile", input: senderInput },
  { path: "/api/clients", method: "GET", handler: getClients, operation: "listClients" },
  { path: "/api/clients", method: "POST", handler: saveClient, operation: "saveClient", input: clientInput },
  { path: "/api/connectors", method: "GET", handler: getConnectors, operation: "listConnectors" },
  { path: "/api/connectors", method: "POST", handler: createConnector, operation: "createConnector", input: { expiresInDays: 7 } },
  { path: `/api/connectors/${foreignId}/revoke`, method: "POST", handler: (request: Request) => revokeConnector(request, { params: Promise.resolve({ id: foreignId }) }), operation: "revokeConnector" },
  { path: "/api/activity", method: "GET", handler: getActivity, operation: "listActivity" },
] as const;

it.each(routes)("$method $path rejects session failures even when a connector credential is presented", async ({ path, method, handler }) => {
  vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError("UNAUTHENTICATED", 401));
  const request = new Request(`${config.appOrigin}${path}?token=connector-credential`, {
    method, headers: { authorization: "Bearer connector-credential", "x-connector-token": "connector-credential" },
    ...(method === "POST" ? { body: "untrusted body" } : {}),
  });
  expectFailure(await handler(request), "UNAUTHENTICATED", 401);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(...(method === "POST" ? [request, true] : [request]));
  expect(getIdentityRuntime).not.toHaveBeenCalled();
  expect(request.bodyUsed).toBe(false);
  for (const operation of Object.values(repository)) expect(operation).not.toHaveBeenCalled();
});

it.each(routes.filter((route) => route.method === "POST"))("$method $path respects runtime origin/host denial before body parsing", async ({ path, handler }) => {
  vi.mocked(requireRequestSession).mockRejectedValue(new IdentityError("ORIGIN_MISMATCH", 403));
  const request = post({}, path);
  expectFailure(await handler(request), "ORIGIN_MISMATCH", 403);
  expect(requireRequestSession).toHaveBeenCalledExactlyOnceWith(request, true);
  expect(getIdentityRuntime).not.toHaveBeenCalled();
  expect(request.bodyUsed).toBe(false);
});

it.each(routes)("$method $path delegates provider error sanitization to apiError", async (route) => {
  const failure = new Error("provider failure with private request data");
  repository[route.operation].mockRejectedValue(failure);
  const request = route.method === "GET" ? new Request(`${config.appOrigin}${route.path}`) : post("input" in route ? route.input : {}, route.path);
  const response = await route.handler(request);
  expect(apiError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(privateJson).not.toHaveBeenCalled();
  expect(response).toBe(vi.mocked(apiError).mock.results[0].value);
});

it.each([
  { name: "sender", handler: POST, input: senderInput, operation: "saveProfile" },
  { name: "client", handler: saveClient, input: clientInput, operation: "saveClient" },
] as const)("rejects stale $name revisions without a success envelope", async ({ handler, input, operation }) => {
  repository[operation].mockRejectedValue(new IdentityError("REVISION_CONFLICT", 409));
  const response = await handler(post(input));
  expect(repository[operation]).toHaveBeenCalledExactlyOnceWith(identity, input);
  expectFailure(response, "REVISION_CONFLICT", 409);
});

it.each([
  { payoutWallet: "0x2222222222222222222222222222222222222222" },
  { ownerWallet: "0x2222222222222222222222222222222222222222" },
  { workspaceId: foreignId }, { provenance: { kind: "user_provided", confirmed: true } },
  { billingAddress: { ...senderInput.billingAddress, unknown: true } },
  { billingAddress: { ...senderInput.billingAddress, payoutWallet: "attacker" } },
  { businessName: { value: "Agent input", provenance: { kind: "user_provided" }, confirmed: true } },
])("rejects unknown, nested, identity, provenance, and agent-shaped billing input (%#)", async (injection) => {
  for (const [handler, input, operation] of [[POST, senderInput, repository.saveProfile], [saveClient, clientInput, repository.saveClient]] as const) {
    vi.mocked(apiError).mockClear();
    expectFailure(await handler(post({ ...input, ...injection })), "INVALID_INPUT", 400);
    expect(operation).not.toHaveBeenCalled();
  }
  expect(getIdentityRuntime).not.toHaveBeenCalled();
});

it.each([
  { expectedRevision: 0 }, { expectedRevision: 1.5 }, { businessName: " " },
  { contactEmail: "not-email" }, { invoicePrefix: "lower" },
  { defaultPaymentTermsDays: -1 }, { defaultPaymentTermsDays: 366 }, { defaultPaymentTermsDays: 1.5 },
  { defaultPaymentTermsDays: "30" }, { billingAddress: { ...senderInput.billingAddress, countryCode: "gb" } },
])("enforces sender schema bounds (%#)", async (invalid) => {
  expectFailure(await POST(post({ ...senderInput, ...invalid })), "INVALID_INPUT", 400);
  expect(repository.saveProfile).not.toHaveBeenCalled();
});

it.each([
  { id: foreignId }, { expectedRevision: 1 }, { id: "bad", expectedRevision: 1 },
  { id: foreignId, expectedRevision: 0 }, { alias: " " }, { contactEmail: "not-email" },
])("enforces client create/update pairing and schema bounds (%#)", async (invalid) => {
  expectFailure(await saveClient(post({ ...clientInput, ...invalid })), "INVALID_INPUT", 400);
  expect(repository.saveClient).not.toHaveBeenCalled();
});

it.each([0, 31, 1.5, "7", null])("rejects unbounded or non-integer connector expiry (%#)", async (expiresInDays) => {
  expectFailure(await createConnector(post({ expiresInDays })), "INVALID_INPUT", 400);
  expect(repository.createConnector).not.toHaveBeenCalled();
});

it.each([{ scopes: ["profile:save"] }, { token: "chosen-secret" }, { workspaceId: foreignId }, { ownerWallet: "attacker" }, { expiresAt: "2099-01-01" }])("rejects extra connector creation fields (%#)", async (extra) => {
  expectFailure(await createConnector(post({ expiresInDays: 7, ...extra })), "INVALID_INPUT", 400);
  expect(repository.createConnector).not.toHaveBeenCalled();
});

it.each(["not-a-uuid", `${foreignId}.secret`, "", `${foreignId}/extra`])("validates revoke params before lookup (%#)", async (id) => {
  expectFailure(await revokeConnector(post({}), { params: Promise.resolve({ id }) }), "INVALID_INPUT", 400);
  expect(repository.revokeConnector).not.toHaveBeenCalled();
});

it("does not reveal a foreign connector or return credentials when revocation is denied", async () => {
  repository.revokeConnector.mockRejectedValue(new IdentityError("NOT_FOUND", 404));
  expectFailure(await revokeConnector(post({}), { params: Promise.resolve({ id: foreignId }) }), "NOT_FOUND", 404);
  expect(repository.revokeConnector).toHaveBeenCalledExactlyOnceWith(identity, foreignId);
});

it("projects only metadata from a successful revoke", async () => {
  const revoked = { ...connector, revokedAt: "2026-09-05T12:00:00.000Z" };
  const stored = { ...revoked, tokenHash: "secret", token: "secret", endpointUrl: "secret" };
  repository.revokeConnector.mockResolvedValue(stored);
  const response = await revokeConnector(post({}), { params: Promise.resolve({ id: foreignId }) });
  expect(await response.json()).toEqual({ connector: revoked });
});

const jsonRoutes = [
  { name: "profile", handler: POST, input: senderInput },
  { name: "clients", handler: saveClient, input: clientInput },
  { name: "connectors", handler: createConnector, input: { expiresInDays: 7 } },
];

it.each(jsonRoutes)("$name accepts at most 16 KiB of JSON including whitespace", async ({ handler, input }) => {
  const json = JSON.stringify(input);
  const body = json + " ".repeat(16 * 1024 - Buffer.byteLength(json));
  const request = new Request(`${config.appOrigin}/api/test`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body });
  expect((await handler(request)).status).toBe(200);
  expect(apiError).not.toHaveBeenCalled();
});

it.each(jsonRoutes)("$name enforces the actual UTF-8 byte limit despite a false Content-Length", async ({ handler }) => {
  const request = new Request(`${config.appOrigin}/api/test`, {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" },
    body: JSON.stringify({ field: "\u00e9".repeat(8192) }),
  });
  expectFailure(await handler(request), "PAYLOAD_TOO_LARGE", 413);
  expect(getIdentityRuntime).not.toHaveBeenCalled();
});

it.each(jsonRoutes)("$name rejects malformed JSON, non-object JSON, and unsupported media types", async ({ handler }) => {
  for (const body of ["{", "null", "[]", "", "true"]) {
    vi.mocked(apiError).mockClear();
    const request = new Request(`${config.appOrigin}/api/test`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expectFailure(await handler(request), "INVALID_INPUT", 400);
  }
  vi.mocked(apiError).mockClear();
  expectFailure(await handler(new Request(`${config.appOrigin}/api/test`, { method: "POST", body: "{}" })), "UNSUPPORTED_MEDIA_TYPE", 415);
  expect(getIdentityRuntime).not.toHaveBeenCalled();
});

it("rejects an oversized declared body before reading it", async () => {
  const request = post(senderInput);
  request.headers.set("content-length", "16385");
  expectFailure(await POST(request), "PAYLOAD_TOO_LARGE", 413);
  expect(request.bodyUsed).toBe(false);
});

it("cancels a chunked body at the byte bound rather than buffering the whole request", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8192).fill(32));
      controller.enqueue(new Uint8Array(8193).fill(32));
    }, cancel,
  });
  const request = new Request(`${config.appOrigin}/api/profile`, {
    method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half",
  } as RequestInit);
  expectFailure(await POST(request), "PAYLOAD_TOO_LARGE", 413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(getIdentityRuntime).not.toHaveBeenCalled();
});

it("sanitizes invalid UTF-8 and stream read failures", async () => {
  const bodies = [
    new Uint8Array([0xff]),
    new ReadableStream({ start(controller) { controller.error(new Error("private body content")); } }),
  ];
  for (const body of bodies) {
    vi.mocked(apiError).mockClear();
    const request = new Request(`${config.appOrigin}/api/profile`, {
      method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
    } as RequestInit);
    expectFailure(await POST(request), "INVALID_INPUT", 400);
  }
});

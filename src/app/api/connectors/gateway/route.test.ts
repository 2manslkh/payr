import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { config } from "../../../../lib/auth/test-support";

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("../../../../lib/auth/runtime", async (original) => ({ ...await original<object>(),
  requireRequestSession: mocks.session, getIdentityRuntime: () => ({ config }),
}));
vi.mock("../../../../lib/db/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
const identity = { workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}`, privyUserId: "did:privy:owner" };
const input = { serviceId: "demo", expiresInDays: 1, scopes: ["invoice:status", "wallet:read"] };
const request = (body: unknown = input) => new Request("https://payrlink.xyz/api/connectors/gateway", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue(identity); });

it("issues a scoped gateway-only credential using the authenticated owner and atomic RPC DTO", async () => {
  mocks.rpc.mockImplementation(async (_name, args) => ({ error: null, data: { id: args.p_id,
    createdAt: new Date().toISOString(), expiresAt: args.p_expires_at, revokedAt: null, lastUsedAt: null, scopes: args.p_scopes } }));
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body = await response.json(); expect(body.token).toMatch(/^pac_/); expect(body.endpointUrl).toBe("");
  expect(mocks.session).toHaveBeenCalledWith(expect.any(Request), true);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_user_id: identity.privyUserId, p_workspace_id: identity.workspaceId, p_scopes: input.scopes });
  expect(mocks.rpc.mock.calls[0][1].p_token_hash).not.toContain(body.token);
});
it("rejects legacy sessions and caller-selected identity overrides", async () => {
  mocks.session.mockResolvedValueOnce({ workspaceId: identity.workspaceId, ownerWallet: identity.ownerWallet });
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request({ ...input, workspaceId: identity.workspaceId }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports unknown SQL errors and malformed success DTOs as sanitized server failures", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private data", code: "XX000" } });
  const failure = await POST(request()); expect(failure.status).toBe(500); expect(await failure.text()).not.toContain("private data");
  mocks.rpc.mockResolvedValueOnce({ data: { unexpected: true }, error: null });
  expect((await POST(request())).status).toBe(500);
});

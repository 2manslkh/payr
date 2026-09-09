// @vitest-environment node
import { expect, it, vi } from "vitest";
import { administerGatewayKey } from "../../../scripts/gateway-key";
import { agentCredentialId, mintAgentCredential, serviceCredentialHash } from "./credentials";
import { operationNames } from "./contracts";

it.each([[], ["create", "bazantic"], ["create", "bazantic", "--confirm", "extra"], ["delete", "bazantic", "--confirm"]].map((args) => ({ args })))(
  "requires the exact administrative confirmation before touching configuration or the database (%#)", async ({ args }) => {
    const rpc = vi.fn();
    await expect(administerGatewayKey(args, {}, { rpc })).rejects.toThrow("Usage:");
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("provisions a domain-separated service hash without identity configuration and returns the secret only once the RPC succeeds", async () => {
  const rpc = vi.fn(async (_name, input) => ({ data: { id: input.p_id, serviceId: input.p_service_id, allowedOperations: input.p_allowed_operations }, error: null }));
  const result = await administerGatewayKey(["create", "bazantic", "--confirm"], {}, { rpc });
  if (!("serviceCredential" in result)) throw new Error("Missing secret");
  expect(agentCredentialId(result.serviceCredential, "service")).toBe(result.id);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_admin_provision_gateway_key_v1", { p_id: result.id, p_service_id: "bazantic",
    p_token_hash: serviceCredentialHash(result.serviceCredential), p_allowed_operations: [...operationNames] });
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.serviceCredential);
});

it.each([{}, { SUPABASE_URL: "https://database.example" }, { SUPABASE_SERVICE_ROLE_KEY: "test-service-role" },
  { SUPABASE_URL: "invalid-url", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" }])(
  "requires explicit valid database configuration without an injected client (%#)", async (environment) => {
    await expect(administerGatewayKey(["create", "bazantic", "--confirm"], environment)).rejects.toThrow("Supabase admin client requires");
  },
);

it("revokes a lost service key by ID without needing its secret or the original pepper", async () => {
  const key = mintAgentCredential("service");
  const rpc = vi.fn().mockResolvedValue({ data: { id: key.id, revoked: true }, error: null });
  const result = await administerGatewayKey(["revoke", "bazantic", key.id.toUpperCase(), "--confirm"], {}, { rpc });
  expect(result).toEqual({ id: key.id, revoked: true });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("payr_admin_revoke_gateway_key_v1", { p_id: key.id, p_service_id: "bazantic" });
});

it("sanitizes RPC errors without returning the newly generated secret", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "PRIVATE PROVIDER CONTENT" } });
  await expect(administerGatewayKey(["create", "bazantic", "--confirm"], {}, { rpc })).rejects.toThrow("provider details are redacted");
});

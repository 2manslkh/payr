import { expect, it, vi } from "vitest";
import { createConnectorService } from "./service";
import { CONNECTOR_SCOPES, type IdentityRepository } from "../identity/contracts";

it("returns a connector once while persisting only its keyed hash and metadata", async () => {
  const createConnector = vi.fn(async (_identity, input) => ({
    id: input.id, createdAt: "2026-09-05T00:00:00.000Z", expiresAt: input.expiresAt,
    revokedAt: null, lastUsedAt: null, scopes: CONNECTOR_SCOPES,
  }));
  const repository = { createConnector } as unknown as IdentityRepository;
  const service = createConnectorService(repository, {
    appOrigin: "https://payrlink.xyz", chainId: 5042002,
    sessionKey: new Uint8Array(32).fill(7), connectorPepper: new Uint8Array(32).fill(8),
  }, () => new Date("2026-09-05T00:00:00.000Z"));
  const result = await service.create({ workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"1".repeat(40)}` }, 7);
  expect(result.endpointUrl).toBe(`https://payrlink.xyz/api/mcp/${result.token}`);
  expect(createConnector.mock.calls[0]?.[1].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(createConnector.mock.calls)).not.toContain(result.token);
});

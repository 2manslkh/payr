import { randomBytes, randomUUID } from "node:crypto";
import { createConnectorSchema, IdentityError, type ConnectorMetadata, type IdentityConfig, type IdentityRepository, type IdentitySession } from "../identity/contracts";
import { createConnectorHasher } from "./crypto";
import { connectorMetadata } from "./metadata";

export function createConnectorService(repository: IdentityRepository, config: IdentityConfig, now: () => Date = () => new Date()): {
  create(identity: IdentitySession, expiresInDays: number): Promise<{ connector: ConnectorMetadata; token: string; endpointUrl: string }>;
} {
  const hash = createConnectorHasher(config.connectorPepper);
  return {
    async create(identity, expiresInDays) {
      if (!createConnectorSchema.safeParse({ expiresInDays }).success) {
        throw new IdentityError("INVALID_INPUT");
      }
      const id = randomUUID();
      const token = `${id}.${randomBytes(32).toString("base64url")}`;
      const expiresAt = new Date(now().getTime() + expiresInDays * 86_400_000).toISOString();
      const endpointUrl = new URL(`/api/mcp/${token}`, config.appOrigin).href;
      const connector = await repository.createConnector(identity, {
        id, tokenHash: hash("connector", token), expiresAt,
      });
      return {
        connector: connectorMetadata(connector),
        token,
        endpointUrl,
      };
    },
  };
}

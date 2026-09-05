import type { ConnectorMetadata, IdentityConfig, IdentityRepository, IdentitySession } from "../identity/contracts";

export function createConnectorService(_repository: IdentityRepository, _config: IdentityConfig, _now: () => Date = () => new Date()): {
  create(identity: IdentitySession, expiresInDays: number): Promise<{ connector: ConnectorMetadata; token: string; endpointUrl: string }>;
} {
  throw new Error("F2 implementation pending");
}

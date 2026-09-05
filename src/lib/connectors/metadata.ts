import type { ConnectorMetadata } from "../identity/contracts";

export function connectorMetadata(record: ConnectorMetadata): ConnectorMetadata {
  return {
    id: record.id,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    scopes: record.scopes,
  };
}

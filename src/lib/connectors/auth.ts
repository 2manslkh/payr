import type { IdentityConfig, IdentityRepository } from "../identity/contracts";

export function createConnectorAuthenticator(_repository: IdentityRepository, _config: IdentityConfig): {
  authenticate(input: { token: string; ip: string; action: string }): Promise<{ workspaceId: string; tokenId: string }>;
} {
  throw new Error("F2 implementation pending");
}

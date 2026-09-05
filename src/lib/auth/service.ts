import type { IdentityConfig, IdentityRepository, IdentitySession, NonceRequest, NonceResponse, SenderProfile, VerifyRequest } from "../identity/contracts";

export type AuthService = Readonly<{
  issue(input: NonceRequest, identity?: IdentitySession): Promise<NonceResponse>;
  verify(input: VerifyRequest, identity?: IdentitySession): Promise<{ session: IdentitySession; profile?: SenderProfile }>;
}>;

export function createAuthService(_repository: IdentityRepository, _config: IdentityConfig, _now: () => Date = () => new Date()): AuthService {
  throw new Error("F2 implementation pending");
}

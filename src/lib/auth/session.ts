import type { IdentityConfig, IdentitySession } from "../identity/contracts";

export type SessionCodec = Readonly<{
  seal(identity: IdentitySession, now?: Date): Promise<string>;
  open(token: string, now?: Date): Promise<IdentitySession | null>;
}>;

export function createSessionCodec(_config: Pick<IdentityConfig, "appOrigin" | "chainId" | "sessionKey">): SessionCodec {
  throw new Error("F2 implementation pending");
}

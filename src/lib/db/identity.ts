import type { IdentityRepository } from "../identity/contracts";
import type { RpcClient } from "./repositories";

export function createIdentityRepository(_client: RpcClient): IdentityRepository {
  throw new Error("F2 implementation pending");
}

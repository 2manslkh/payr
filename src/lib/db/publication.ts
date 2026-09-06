import type { PublicationRepository } from "../invoices/publication-contracts";
import type { RpcClient } from "./repositories";

export function createPublicationRepository(_client: RpcClient): PublicationRepository {
  throw new Error("R05 implementation pending");
}

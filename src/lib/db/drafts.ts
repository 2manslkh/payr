import type { DraftRepository } from "../invoices/contracts";
import type { RpcClient } from "./repositories";

export function createDraftRepository(_client: RpcClient): DraftRepository {
  throw new Error("F3 implementation pending");
}

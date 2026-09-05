import { createSupabaseAdminClient } from "../db/admin";
import { createDraftRepository } from "../db/drafts";

export function getDraftRepository() {
  return createDraftRepository(createSupabaseAdminClient());
}

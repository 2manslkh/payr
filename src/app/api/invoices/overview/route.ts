import { privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { DraftError } from "../../../../lib/invoices/errors";
import { ownerActor, safeDraftError } from "../../../../lib/invoices/projections";
import { getDraftRepository } from "../../../../lib/invoices/runtime";

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request, false);
    if (new URL(request.url).search) throw new DraftError("INVALID_INPUT", 400);
    return privateJson(await getDraftRepository().getOverview(ownerActor(session)));
  } catch (error) {
    return safeDraftError(error);
  }
}

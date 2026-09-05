import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { saveSenderSchema } from "../../../lib/identity/contracts";
import { parseIdentityInput } from "../../../lib/profiles/input";

export async function GET(request: Request) {
  try {
    const identity = await requireRequestSession(request);
    const { repository } = getIdentityRuntime();
    return privateJson({ profile: await repository.getProfile(identity) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireRequestSession(request, true);
    const input = await parseIdentityInput(request, saveSenderSchema);
    const { repository } = getIdentityRuntime();
    return privateJson({ profile: await repository.saveProfile(identity, input) });
  } catch (error) {
    return apiError(error);
  }
}

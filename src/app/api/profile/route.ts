import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { IdentityError, saveSenderRequestSchema } from "../../../lib/identity/contracts";
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
    const { expectedProfileId, ...input } = await parseIdentityInput(request, saveSenderRequestSchema);
    const { repository } = getIdentityRuntime();
    // The captured session supplies authority; the immutable ID binds the user's reviewed form.
    const profile = await repository.getProfile(identity);
    if (profile.id !== expectedProfileId) throw new IdentityError("PROFILE_CHANGED", 409);
    return privateJson({ profile: await repository.saveProfile(identity, input) });
  } catch (error) {
    return apiError(error);
  }
}

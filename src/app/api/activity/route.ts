import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";

export async function GET(request: Request) {
  try {
    const identity = await requireRequestSession(request);
    const { repository } = getIdentityRuntime();
    const events = (await repository.listActivity(identity))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 100)
      .map(({ id, tokenId, action, outcome, createdAt }) => ({ id, tokenId, action, outcome, createdAt }));
    return privateJson({ events });
  } catch (error) {
    return apiError(error);
  }
}

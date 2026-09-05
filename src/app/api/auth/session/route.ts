import { apiError, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";

export async function GET(request: Request): Promise<Response> {
  try {
    return privateJson({ session: await requireRequestSession(request, false) });
  } catch (error) {
    return apiError(error);
  }
}

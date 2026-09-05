import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { saveClientSchema } from "../../../lib/identity/contracts";
import { parseIdentityInput } from "../../../lib/profiles/input";

export async function GET(request: Request) {
  try {
    const identity = await requireRequestSession(request);
    const { repository } = getIdentityRuntime();
    return privateJson({ clients: await repository.listClients(identity) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireRequestSession(request, true);
    const input = await parseIdentityInput(request, saveClientSchema);
    const { repository } = getIdentityRuntime();
    return privateJson({ client: await repository.saveClient(identity, input) });
  } catch (error) {
    return apiError(error);
  }
}

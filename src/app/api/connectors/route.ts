import { apiError, getIdentityRuntime, privateJson, requireRequestSession } from "../../../lib/auth/runtime";
import { connectorMetadata } from "../../../lib/connectors/metadata";
import { createConnectorService } from "../../../lib/connectors/service";
import { createConnectorSchema } from "../../../lib/identity/contracts";
import { parseIdentityInput } from "../../../lib/profiles/input";

export async function GET(request: Request) {
  try {
    const identity = await requireRequestSession(request);
    const { repository } = getIdentityRuntime();
    return privateJson({ connectors: (await repository.listConnectors(identity)).map(connectorMetadata) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireRequestSession(request, true);
    const input = await parseIdentityInput(request, createConnectorSchema);
    const { repository, config } = getIdentityRuntime();
    return privateJson(await createConnectorService(repository, config).create(identity, input.expiresInDays));
  } catch (error) {
    return apiError(error);
  }
}

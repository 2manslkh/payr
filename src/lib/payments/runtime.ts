import { createPublicClient, http } from "viem";
import { createPaymentEnv } from "../../config/env";
import { payrSettlementAbi } from "../chain/abi";
import { arcTestnet } from "../chain/arc";
import { createLocalTestnetSigner } from "../chain/signer";
import { createSupabaseAdminClient } from "../db/admin";
import { createPayrRepositories } from "../db/repositories";
import { createDocumentRuntime } from "../documents/runtime";
import { createAuthorizationService } from "./authorize";

export function createPaymentRuntime() {
  const config = createPaymentEnv();
  const documents = createDocumentRuntime();
  const local = createLocalTestnetSigner(config);
  const chain = createPublicClient({ chain: arcTestnet, transport: http(config.rpcUrl, { retryCount: 0, timeout: 10_000 }) });
  return createAuthorizationService({
    access: documents.access, repository: createPayrRepositories(createSupabaseAdminClient()),
    signer: { ...local, async sign(data) {
      const address = data.domain.verifyingContract;
      if (!config.trustedContracts.includes(address.toLowerCase() as typeof address)) throw new Error("AUTHORIZATION_DENIED");
      const [chainId, attestor] = await Promise.all([
        chain.getChainId(),
        chain.readContract({ address, abi: payrSettlementAbi, functionName: "attestor" }),
      ]);
      if (chainId !== config.chainId || attestor.toLowerCase() !== local.attestor.toLowerCase()) throw new Error("AUTHORIZATION_DENIED");
      return local.sign(data);
    } },
  });
}

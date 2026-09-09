import { createPublicClient, http } from "viem";
import { z } from "zod";
import { apiError, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { arcTestnet, ARC_TESTNET_CHAIN_ID } from "../../../../lib/chain/arc";
import { IdentityError } from "../../../../lib/identity/contracts";

export async function GET(request: Request) {
  try {
    await requireRequestSession(request, false);
    const entries = [...new URL(request.url).searchParams];
    if (entries.length !== 1 || entries[0][0] !== "address" || !/^0x[0-9a-fA-F]{40}$/.test(entries[0][1])) {
      throw new IdentityError("INVALID_INPUT", 400);
    }
    const address = entries[0][1].toLowerCase() as `0x${string}`;
    try {
      const config = z.object({
        ARC_CHAIN_ID: z.literal(String(ARC_TESTNET_CHAIN_ID)),
        ARC_RPC_URL: z.string().url().refine((value) => new URL(value).protocol === "https:"),
      }).parse(process.env);
      const client = createPublicClient({ chain: arcTestnet, transport: http(config.ARC_RPC_URL, { timeout: 8_000, retryCount: 0 }) });
      const [chainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address })]);
      if (chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Unexpected balance network");
      return privateJson({ address, chainId, balanceAtomic: balance.toString(), updatedAt: new Date().toISOString() });
    } catch {
      return privateJson({ code: "BALANCE_UNAVAILABLE" }, 503);
    }
  } catch (error) {
    return apiError(error);
  }
}

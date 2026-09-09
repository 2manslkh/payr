import { createHmac } from "node:crypto";
import { createPublicClient, http } from "viem";
import { z } from "zod";
import { apiError, getIdentityConfig, privateJson, requireRequestSession } from "../../../../lib/auth/runtime";
import { arcTestnet, ARC_TESTNET_CHAIN_ID } from "../../../../lib/chain/arc";
import { createSupabaseAdminClient } from "../../../../lib/db/admin";
import { IdentityError } from "../../../../lib/identity/contracts";
import { normalizeIp } from "../../../../lib/security/ip";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request, false);
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
      // Only Vercel's overwritten header is trusted; other runtimes share one bucket.
      const ip = process.env.VERCEL === "1"
        ? normalizeIp(request.headers.get("x-vercel-forwarded-for") ?? "") : "127.0.0.1";
      if (ip === null) throw new Error("Unavailable request identity");
      const ipHash = createHmac("sha256", getIdentityConfig().connectorPepper)
        .update(`payr:wallet-balance:ip:v1:${ip}`).digest("hex");
      const { data, error } = await createSupabaseAdminClient().rpc("payr_admit_wallet_balance_v1", {
        p_workspace_id: session.workspaceId, p_owner_wallet: session.ownerWallet, p_ip_hash: ipHash,
      }).abortSignal(AbortSignal.timeout(2_000));
      if (error) throw new Error("Unavailable admission");
      const admission = z.object({ allowed: z.boolean() }).strict().parse(data);
      if (!admission.allowed) {
        const response = privateJson({ code: "RATE_LIMITED" }, 429);
        response.headers.set("Retry-After", "60");
        return response;
      }
      // Each admitted request spends at most two provider calls, with no retries.
      // Keep the deadline active through response-body consumption, not just headers.
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 8_000);
      try {
        const client = createPublicClient({ chain: arcTestnet, transport: http(config.ARC_RPC_URL, {
          timeout: 8_000, retryCount: 0, fetchOptions: { signal: controller.signal },
        }) });
        const [chainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address })]);
        if (chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("Unexpected balance network");
        return privateJson({ address, chainId, balanceAtomic: balance.toString(), updatedAt: new Date().toISOString() });
      } finally {
        clearTimeout(deadline);
        controller.abort();
      }
    } catch {
      return privateJson({ code: "BALANCE_UNAVAILABLE" }, 503);
    }
  } catch (error) {
    return apiError(error);
  }
}

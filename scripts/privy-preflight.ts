import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { receivingWalletPolicy } from "../src/lib/privy/policy";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;
try {
  if (!appId || !appSecret) throw new Error("Privy app ID and secret must be configured");
  const client = new PrivyClient({ appId, appSecret, timeout: 15_000, maxRetries: 0 });
  await client.apps().getSettings();
  console.log("Privy app credentials verified. No users, wallets, or funds were modified.");
  if (process.argv.includes("--create-policy")) {
    if (process.env.PRIVY_WALLET_POLICY_ID) throw new Error("Policy already configured; refusing to create another");
    const policy = await client.policies().create({ ...receivingWalletPolicy(origin),
      idempotency_key: `payr-receiving-v1-${createHash("sha256").update(origin).digest("hex").slice(0, 32)}` });
    console.log(`Created receiving-only policy. PRIVY_WALLET_POLICY_ID=${policy.id}`);
    console.log("Configure this ID before sign-in. This is policy creation evidence, not a live policy-denial or wallet-ownership test.");
  } else if (process.env.PRIVY_WALLET_POLICY_ID) {
    const policy = await client.policies().get(process.env.PRIVY_WALLET_POLICY_ID);
    console.log(`Configured policy is accessible (${policy.rules.length} rules).`);
  } else console.log("No wallet policy configured. Run with --create-policy to create the receiving-only testnet policy.");
} catch (error) {
  // SDK errors may contain request details. Never serialize them or their causes.
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  console.error(status ? `Privy preflight failed (HTTP ${status}). Check app credentials and API access.` : "Privy preflight failed. Check configuration and network access.");
  process.exitCode = 1;
}

import { stringToHex } from "viem";
import { ConsoleError } from "./console-api";

type EthereumProvider = { request(input: { method: string; params?: unknown[] }): Promise<unknown> };

export async function connectWallet(ownerWallet?: string) {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!provider?.request) throw new ConsoleError("MISSING_WALLET");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const wallet: unknown = Array.isArray(accounts) ? accounts[0] : null;
  if (typeof wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(wallet))
    throw new ConsoleError("INVALID_WALLET");
  if (ownerWallet && wallet.toLowerCase() !== ownerWallet.toLowerCase())
    throw new ConsoleError("WRONG_OWNER");
  return { provider, wallet };
}

export async function signWalletMessage(
  connection: Awaited<ReturnType<typeof connectWallet>>,
  message: string,
) {
  const signature = await connection.provider.request({
    method: "personal_sign",
    params: [stringToHex(message), connection.wallet],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature))
    throw new ConsoleError("INVALID_WALLET");
  return signature;
}

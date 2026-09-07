import { isDeepStrictEqual } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import type { createPaymentEnv } from "../../config/env";
import { paymentTypedData, type PaymentTypedData } from "../domain/payment-authorization";
import { ARC_TESTNET_CHAIN_ID } from "./arc";

export type PaymentSigner = {
  attestor: Address; mode: "local-testnet";
  sign(data: PaymentTypedData): Promise<Hex>;
};

export function createLocalTestnetSigner(config: ReturnType<typeof createPaymentEnv>): PaymentSigner {
  if (config.signerMode !== "local-testnet" || config.allowLocalSigner !== true
    || config.moneyMode !== "testnet" || config.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("AUTHORIZATION_DENIED");
  const account = privateKeyToAccount(config.privateKey);
  if (account.address.toLowerCase() !== config.attestor.toLowerCase()) throw new Error("AUTHORIZATION_DENIED");
  return {
    attestor: account.address, mode: "local-testnet",
    async sign(data) {
      if (!config.trustedContracts.includes(data.domain.verifyingContract.toLowerCase() as Address)
        || !isDeepStrictEqual(data, paymentTypedData(config.chainId, data.domain.verifyingContract, data.message))) throw new Error("AUTHORIZATION_DENIED");
      const { message } = data;
      if (message.amount <= 0n || /^0x0{40}$/i.test(message.payee)
        || message.authorizationValidUntil >= message.payableUntil) throw new Error("AUTHORIZATION_DENIED");
      return account.signTypedData(data);
    },
  };
}

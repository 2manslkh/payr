import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { paymentTypedData, paymentTypes } from "../domain/payment-authorization";
import { authorizationResponseSchema, PaymentError, type PaymentSetup } from "./payment-contracts";

export type AuthorizedPayment = ReturnType<typeof paymentTypedData> & { signature: Hex };
export type PaymentAdapter = {
  account(): Promise<{ address: Address; chainId: number }>;
  balance(address: Address): Promise<bigint>;
  authorize(): Promise<unknown>;
  simulate(payment: AuthorizedPayment, account: Address): Promise<{ gas: bigint; maxFeePerGas: bigint }>;
  write(payment: AuthorizedPayment, account: Address, gas: bigint, maxFeePerGas: bigint): Promise<Hex>;
};

export async function payInvoice(setup: PaymentSetup, adapter: PaymentAdapter,
  onReview: (review: { validUntil: number; gasReserve: bigint }) => void, now = Date.now): Promise<Hex> {
  const first = await adapter.account();
  if (first.chainId !== 5042002) throw new PaymentError("WRONG_NETWORK");
  if (await adapter.balance(first.address) <= BigInt(setup.amountAtomic)) throw new PaymentError("INSUFFICIENT_BALANCE");
  let payment: AuthorizedPayment;
  try {
    const response = authorizationResponseSchema.parse(await adapter.authorize());
    const { message, domain } = response;
    if (JSON.stringify(response.types) !== JSON.stringify(paymentTypes) || domain.verifyingContract.toLowerCase() !== setup.contractAddress.toLowerCase()
      || message.invoiceKey.toLowerCase() !== setup.invoiceKey.toLowerCase() || message.documentCommitment.toLowerCase() !== setup.documentCommitment.toLowerCase()
      || message.payee.toLowerCase() !== setup.payee.toLowerCase() || message.amount !== setup.amountAtomic
      || BigInt(message.payableUntil) !== BigInt(Date.parse(setup.payableUntil) / 1000)
      || BigInt(message.authorizationValidUntil) >= BigInt(message.payableUntil)
      || BigInt(message.authorizationValidUntil) > BigInt(Math.floor(now() / 1000) + 600)) throw new Error();
    payment = { ...paymentTypedData(5042002, setup.contractAddress, { invoiceKey: setup.invoiceKey,
      documentCommitment: setup.documentCommitment, payee: setup.payee, amount: BigInt(message.amount),
      authorizationValidUntil: BigInt(message.authorizationValidUntil), payableUntil: BigInt(message.payableUntil) }), signature: response.signature as Hex };
    if ((await recoverTypedDataAddress(payment)).toLowerCase() !== setup.attestor.toLowerCase()) throw new Error();
  } catch { throw new PaymentError("AUTHORIZATION_INVALID"); }
  const validUntil = Number(payment.message.authorizationValidUntil);
  if (now() >= validUntil * 1000) throw new PaymentError("AUTHORIZATION_EXPIRED");
  const gas = await adapter.simulate(payment, first.address);
  const reserve = gas.gas * gas.maxFeePerGas;
  if (gas.gas <= 0n || gas.maxFeePerGas <= 0n) throw new PaymentError("PAYMENT_UNAVAILABLE");
  onReview({ validUntil, gasReserve: reserve });
  if (await adapter.balance(first.address) < payment.message.amount + reserve) throw new PaymentError("INSUFFICIENT_BALANCE");
  const current = await adapter.account();
  if (current.address.toLowerCase() !== first.address.toLowerCase() || current.chainId !== 5042002) throw new PaymentError("WALLET_CHANGED");
  if (now() >= validUntil * 1000) throw new PaymentError("AUTHORIZATION_EXPIRED");
  return adapter.write(payment, first.address, gas.gas, gas.maxFeePerGas);
}

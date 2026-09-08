// @vitest-environment node
import { expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { paymentTypedData } from "../domain/payment-authorization";
import { payInvoice, type PaymentAdapter } from "./pay";
import type { PaymentSetup } from "./payment-contracts";

async function fixture() {
  const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
  const setup: PaymentSetup = { invoiceKey: `0x${"1".repeat(64)}`, documentCommitment: `0x${"2".repeat(64)}`,
    contractAddress: `0x${"3".repeat(40)}`, payee: `0x${"4".repeat(40)}`, amountAtomic: "1000000000000000000", amountDecimal: "1",
    payableUntil: new Date(2000_000).toISOString(), attestor: account.address, appOrigin: "https://example.test", projectId: "1".repeat(32), rpcUrl: "https://rpc.test" };
  const typed = paymentTypedData(5042002, setup.contractAddress, { invoiceKey: setup.invoiceKey, documentCommitment: setup.documentCommitment,
    payee: setup.payee, amount: 10n ** 18n, authorizationValidUntil: 1600n, payableUntil: 2000n });
  const response = { ...typed, schemaVersion: "payr.payment-authorization.v1", authorizationId: "00000000-0000-4000-8000-000000000001",
    domain: { ...typed.domain, chainId: 5042002 }, message: { ...typed.message, amount: "1000000000000000000", authorizationValidUntil: "1600", payableUntil: "2000" },
    signature: await account.signTypedData(typed), signerMode: "local-testnet", network: "Arc Testnet" };
  const adapter = { account: vi.fn().mockResolvedValue({ address: account.address, chainId: 5042002 }),
    balance: vi.fn().mockResolvedValue(2n * 10n ** 18n), authorize: vi.fn().mockResolvedValue(response),
    simulate: vi.fn().mockResolvedValue({ gas: 100000n, maxFeePerGas: 100n }), write: vi.fn().mockResolvedValue(`0x${"5".repeat(64)}`) } satisfies PaymentAdapter;
  return { setup, adapter, response };
}

it("authorizes exact value once and separately reviews the gas reserve", async () => {
  const { setup, adapter } = await fixture(); const review = vi.fn();
  await payInvoice(setup, adapter, review, () => 1000_000);
  expect(adapter.authorize).toHaveBeenCalledOnce();
  expect(adapter.write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.objectContaining({ amount: 10n ** 18n }) }), expect.any(String), 100000n, 100n);
  expect(review).toHaveBeenCalledWith({ validUntil: 1600, gasReserve: 10000000n });
});

it.each(["network", "balance", "gas", "invalid", "signature", "expired", "changed", "rejected", "revert"])("makes no wallet write on %s failure", async (kind) => {
  const { setup, adapter, response } = await fixture();
  if (kind === "network") adapter.account.mockResolvedValue({ address: setup.payee, chainId: 1 });
  if (kind === "balance") adapter.balance.mockResolvedValue(0n);
  if (kind === "gas") adapter.balance.mockResolvedValue(10n ** 18n + 1n);
  if (kind === "invalid") response.message.amount = "2";
  if (kind === "signature") setup.attestor = setup.payee;
  if (kind === "expired") response.message.authorizationValidUntil = "1000";
  if (kind === "changed") adapter.account.mockResolvedValueOnce({ address: setup.attestor, chainId: 5042002 }).mockResolvedValue({ address: setup.payee, chainId: 5042002 });
  if (kind === "rejected") adapter.authorize.mockRejectedValue(new Error("denied"));
  if (kind === "revert") adapter.simulate.mockRejectedValue(new Error("reverted"));
  await expect(payInvoice(setup, adapter, vi.fn(), () => 1000_000)).rejects.toThrow();
  expect(adapter.write).not.toHaveBeenCalled();
  if (["network", "balance"].includes(kind)) expect(adapter.authorize).not.toHaveBeenCalled();
});

it("rechecks expiry after slow simulation", async () => {
  const { setup, adapter } = await fixture(); let now = 1000_000;
  adapter.simulate.mockImplementation(async () => { now = 1600_000; return { gas: 1n, maxFeePerGas: 1n }; });
  await expect(payInvoice(setup, adapter, vi.fn(), () => now)).rejects.toThrow("AUTHORIZATION_EXPIRED");
  expect(adapter.write).not.toHaveBeenCalled();
});

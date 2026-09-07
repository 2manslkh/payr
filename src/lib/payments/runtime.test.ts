// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createPaymentEnv } from "../../config/env";
import { paymentTypedData } from "../domain/payment-authorization";
import { createAuthorizationService } from "./authorize";
import { createPaymentRuntime } from "./runtime";

const { readContract, getChainId } = vi.hoisted(() => ({ readContract: vi.fn(), getChainId: vi.fn() }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => ({ readContract, getChainId }) }));
vi.mock("../../config/env", async (original) => ({ ...await original<typeof import("../../config/env")>(), createPaymentEnv: vi.fn() }));
vi.mock("../documents/runtime", () => ({ createDocumentRuntime: () => ({ access: {} }) }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("./authorize", () => ({ createAuthorizationService: vi.fn(() => ({ authorize: vi.fn() })) }));

const key = `0x${"0".repeat(63)}1` as const;
const attestor = privateKeyToAccount(key).address;
const oldContract = `0x${"11".repeat(20)}` as const;
const newContract = `0x${"22".repeat(20)}` as const;
const typed = paymentTypedData(5042002, oldContract, {
  invoiceKey: `0x${"33".repeat(32)}`, documentCommitment: `0x${"44".repeat(32)}`, payee: newContract,
  amount: 1n, authorizationValidUntil: 1600n, payableUntil: 2000n,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createPaymentEnv).mockReturnValue({ signerMode: "local-testnet", allowLocalSigner: true, moneyMode: "testnet",
    chainId: 5042002, rpcUrl: "https://rpc.test", contractAddress: newContract,
    attestor, trustedContracts: [newContract, oldContract], privateKey: key });
  readContract.mockResolvedValue(attestor);
  getChainId.mockResolvedValue(5042002);
});

it("checks the frozen historical contract onchain, not the new publication default", async () => {
  createPaymentRuntime();
  const { signer } = vi.mocked(createAuthorizationService).mock.calls[0][0];
  await expect(signer.sign(typed)).resolves.toMatch(/^0x[0-9a-f]{130}$/);
  expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ address: oldContract, functionName: "attestor" }));
});

it.each(["chain", "attestor", "rpc", "untrusted"])("denies runtime %s mismatch before returning a signature", async (kind) => {
  if (kind === "chain") getChainId.mockResolvedValue(1);
  if (kind === "attestor") readContract.mockResolvedValue(newContract);
  if (kind === "rpc") readContract.mockRejectedValue(new Error("provider unavailable"));
  createPaymentRuntime();
  const { signer } = vi.mocked(createAuthorizationService).mock.calls[0][0];
  await expect(signer.sign(kind === "untrusted" ? { ...typed, domain: { ...typed.domain, verifyingContract: `0x${"55".repeat(20)}` } } : typed)).rejects.toThrow();
  if (kind === "untrusted") expect(readContract).not.toHaveBeenCalled();
});

// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { payrSettlementAbi } from "../chain/abi";
import { paymentSetup as setup } from "./payment.test-support";
import { watchPaymentReplacement } from "./browser-payment";

const rpc = vi.hoisted(() => ({ getChainId: vi.fn(), getTransactionReceipt: vi.fn(), getBlock: vi.fn() }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => rpc }));
afterEach(() => { vi.unstubAllGlobals(); });

it.each(["matching", "reverted", "wrong-block", "wrong-transaction", "wrong-commitment", "wrong-amount", "wrong-contract", "removed", "expired", "aborted"])(
  "reports only a matching committed successful payment before server settlement (%s)", async (kind) => {
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    const hash = `0x${"6".repeat(64)}` as const, blockHash = `0x${"7".repeat(64)}` as const;
    const receipt = { status: kind === "reverted" ? "reverted" : "success", transactionHash: kind === "wrong-transaction" ? blockHash : hash,
      blockNumber: 100n, blockHash, logs: [{ address: kind === "wrong-contract" ? setup.payee : setup.contractAddress,
        transactionHash: hash, blockHash, blockNumber: 100n, logIndex: 0, removed: kind === "removed",
        topics: encodeEventTopics({ abi: payrSettlementAbi, eventName: "InvoicePaid", args: { invoiceKey: setup.invoiceKey, payer: setup.payee, payee: setup.payee } }),
        data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [kind === "wrong-commitment" ? hash : setup.documentCommitment, kind === "wrong-amount" ? 1n : BigInt(setup.amountAtomic)]),
      }] };
    const controller = new AbortController();
    rpc.getChainId.mockResolvedValue(5042002);
    rpc.getTransactionReceipt.mockResolvedValue(receipt);
    rpc.getBlock.mockImplementation(async () => {
      if (kind === "aborted") controller.abort();
      return { hash: kind === "wrong-block" ? hash : blockHash, number: 100n,
        timestamp: kind === "expired" ? BigInt(Date.parse(setup.payableUntil) / 1000) : 1000n };
    });
    const confirmed = vi.fn(), replaced = vi.fn();
    await watchPaymentReplacement(setup, hash, controller.signal, replaced, confirmed);
    expect(confirmed).toHaveBeenCalledTimes(kind === "matching" ? 1 : 0);
    expect(replaced).not.toHaveBeenCalled();
  },
);

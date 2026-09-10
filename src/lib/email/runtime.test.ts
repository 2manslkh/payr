// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createReceiptDeliveryEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createOutboxRepository } from "../db/outbox";
import { createReceiptRuntime } from "../receipts/runtime";
import { createReceiptWorker } from "../receipts/worker";
import { createOutboxWorker } from "./outbox";
import { createOutboxRuntime, processReceipt } from "./runtime";
import { afterSettlement } from "../payments/reconciliation-runtime";
import { createResendReceiptProvider } from "./resend";
import type { ReceiptEmailPayload } from "./outbox-contracts";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../config/env", () => ({ createReceiptDeliveryEnv: vi.fn() }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../db/outbox", () => ({ createOutboxRepository: vi.fn() }));
vi.mock("../receipts/runtime", () => ({ createReceiptRuntime: vi.fn() }));
vi.mock("../receipts/worker", () => ({ createReceiptWorker: vi.fn() }));
vi.mock("../documents/receipt-storage", () => ({ createReceiptDocumentPort: vi.fn() }));
vi.mock("./outbox", () => ({ createOutboxWorker: vi.fn() }));
vi.mock("./resend", () => ({ createResendReceiptProvider: vi.fn() }));
const generate = vi.fn(), send = vi.fn(), providerSend = vi.fn();
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.mocked(createReceiptDeliveryEnv).mockReturnValue({ apiKey: "mock-only", from: "sender@example.test" });
  vi.mocked(createSupabaseAdminClient).mockReturnValue({} as ReturnType<typeof createSupabaseAdminClient>);
  vi.mocked(createReceiptRuntime).mockReturnValue({} as ReturnType<typeof createReceiptRuntime>);
  vi.mocked(createReceiptWorker).mockReturnValue({ run: generate });
  vi.mocked(createOutboxWorker).mockReturnValue({ run: send });
  vi.mocked(createResendReceiptProvider).mockReturnValue({ send: providerSend });
  generate.mockResolvedValue({ outcome: "ready" });
  send.mockResolvedValue({ outcome: "sent" });
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

it("tracks post-response receipt generation and sends only that receipt's two destinations", async () => {
  afterSettlement(id, performance.now() + 280_000);
  expect(generate).not.toHaveBeenCalled();
  const callback = vi.mocked(after).mock.calls[0][0];
  if (typeof callback !== "function") throw new Error("Expected tracked callback");
  await callback();
  expect(generate).toHaveBeenCalledExactlyOnceWith(id);
  expect(createOutboxRepository).toHaveBeenCalledWith(expect.any(Object), { receiptDocumentId: id });
  expect(send).toHaveBeenCalledTimes(2);
  expect(generate.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
});

it("uses the eligibility-filtered repository for unscoped cron too", () => {
  createOutboxRuntime();
  expect(createOutboxRepository).toHaveBeenCalledWith(expect.any(Object), { receiptDocumentId: undefined });
});

it("still sends when generation is idle because the receipt is already ready", async () => {
  generate.mockResolvedValue({ outcome: "idle" });
  send.mockResolvedValue({ outcome: "idle" });
  await processReceipt(id);
  expect(send).toHaveBeenCalledOnce();
});

it("generates receipts while sending is disabled without constructing an outbox", async () => {
  vi.mocked(createReceiptDeliveryEnv).mockReturnValue(null);
  await processReceipt(id);
  expect(generate).toHaveBeenCalledOnce();
  expect(createOutboxRepository).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("charges generation to the original request budget and reserves provider completion time", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  generate.mockImplementation(async () => { now = 230_000; return { outcome: "ready" }; });
  await processReceipt(id, 280_000);
  expect(send).not.toHaveBeenCalled();
  generate.mockClear();
  await processReceipt(id, 280_000);
  expect(generate).not.toHaveBeenCalled();
});

it("rejects invalid scope before generating or claiming anything", async () => {
  await expect(processReceipt("invalid")).rejects.toThrow();
  expect(generate).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("caps provider I/O by the invocation budget even if preparation was unexpectedly slow", async () => {
  createOutboxRuntime(id, 280_000);
  const provider = vi.mocked(createOutboxWorker).mock.calls[0][2];
  const payload = {} as ReceiptEmailPayload;
  await provider.send(payload, "stable-key", 400_000);
  expect(providerSend).toHaveBeenCalledWith(payload, "stable-key", 265_000);
  await provider.send(payload, "stable-key", 200_000);
  expect(providerSend).toHaveBeenLastCalledWith(payload, "stable-key", 200_000);
});

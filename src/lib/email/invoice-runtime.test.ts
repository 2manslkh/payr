// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInvoiceDeliveryEnv, createPublicationLinkEnv } from "../../config/env";
import { createSupabaseAdminClient } from "../db/admin";
import { createInvoiceOutboxRepository } from "../db/outbox";
import { createOutboxWorker } from "./outbox";
import { drainInvoiceEmails } from "./invoice-runtime";
import { afterPublication } from "../invoices/publication-runtime";
import { after } from "next/server";
import { createPublicationRepository } from "../db/publication";
import { createPublicationWorker } from "../invoices/publication-worker";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../config/env", () => ({ createInvoiceDeliveryEnv: vi.fn(), createPublicationLinkEnv: vi.fn() }));
vi.mock("../db/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../db/outbox", () => ({ createInvoiceOutboxRepository: vi.fn() }));
vi.mock("../documents/invoice-storage", () => ({ createPrivateDocumentStorage: vi.fn(), createInvoiceDocumentPort: vi.fn() }));
vi.mock("../db/publication", () => ({ createPublicationRepository: vi.fn() }));
vi.mock("../db/documents", () => ({ createDocumentRepository: vi.fn() }));
vi.mock("../invoices/publication-worker", () => ({ createPublicationWorker: vi.fn() }));
vi.mock("./outbox", () => ({ createOutboxWorker: vi.fn() }));
const run = vi.fn();
const recover = vi.fn();
beforeEach(() => {
  vi.mocked(createSupabaseAdminClient).mockReturnValue({} as ReturnType<typeof createSupabaseAdminClient>);
  vi.mocked(createInvoiceDeliveryEnv).mockReturnValue({ apiKey: "mock-provider-only", from: "sender@example.test" });
  vi.mocked(createPublicationLinkEnv).mockReturnValue({ appOrigin: "https://example.test", explorerOrigin: "https://explorer.test", keys: new Map() });
  vi.mocked(createOutboxWorker).mockReturnValue({ run });
  run.mockResolvedValue({ outcome: "sent" });
  recover.mockResolvedValue({ outcome: "idle" });
  vi.mocked(createPublicationWorker).mockReturnValue({ run: recover });
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

it("registers tracked Next after work, then drains only the committed publication's two deliveries", async () => {
  afterPublication("00000000-0000-4000-8000-000000000001");
  expect(run).not.toHaveBeenCalled();
  const callback = vi.mocked(after).mock.calls[0][0];
  if (typeof callback !== "function") throw new Error("Expected tracked callback");
  await callback();
  expect(createInvoiceOutboxRepository).toHaveBeenCalledWith(expect.any(Object), "00000000-0000-4000-8000-000000000001");
  expect(run).toHaveBeenCalledTimes(2);
  expect(recover).not.toHaveBeenCalled();
});

it("bounds the invoice-only cron drain and stops on idle", async () => {
  expect(await drainInvoiceEmails()).toEqual({ outcome: "drained", processed: 8 });
  expect(run).toHaveBeenCalledTimes(8);
  expect(recover).toHaveBeenCalledExactlyOnceWith();
  expect(createPublicationRepository).toHaveBeenCalledWith(expect.anything(), { invoiceEmailOnly: true });
  run.mockClear().mockResolvedValue({ outcome: "idle" });
  expect(await drainInvoiceEmails()).toEqual({ outcome: "drained", processed: 0 });
  expect(run).toHaveBeenCalledOnce();
  await expect(drainInvoiceEmails({ limit: 9 })).rejects.toThrow("INVALID_INPUT");
});

it("does not create database/provider work when disabled", async () => {
  vi.mocked(createInvoiceDeliveryEnv).mockReturnValue(null);
  expect(await drainInvoiceEmails()).toEqual({ outcome: "disabled", processed: 0 });
  expect(createSupabaseAdminClient).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  expect(recover).not.toHaveBeenCalled();
});

it("resumes one publication before draining its committed deliveries and charges recovery to the budget", async () => {
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  recover.mockImplementation(async () => { elapsed = 200_000; return { outcome: "retryable" }; });
  expect(await drainInvoiceEmails()).toEqual({ outcome: "drained", processed: 0 });
  expect(recover).toHaveBeenCalledOnce(); expect(run).not.toHaveBeenCalled();
});

it("continues delivery progress after a retryable publication and never recovers twice in one drain", async () => {
  recover.mockResolvedValue({ outcome: "retryable" });
  expect(await drainInvoiceEmails({ limit: 2 })).toEqual({ outcome: "drained", processed: 2 });
  expect(recover).toHaveBeenCalledOnce();
  expect(recover.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
});

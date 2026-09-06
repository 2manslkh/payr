import { expect, it, vi } from "vitest";
import { createInvoiceLifecycleService } from "./lifecycle";
import type { PublicationRepository } from "./publication-contracts";

it("does not materialize links for a draft without finalized artifacts", async () => {
  const data = {
    invoiceId: "00000000-0000-4000-8000-000000000001", invoiceVersion: 1, invoiceNumber: null,
    commercialState: "draft", payableUntil: null, voidedAt: null, snapshot: null, attempt: null,
    settlement: null, receipt: null, deliveries: [],
  };
  const service = createInvoiceLifecycleService({ statusData: vi.fn().mockResolvedValue(data) } as unknown as PublicationRepository, {
    appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(7)]]),
  });
  const result = await service.status({ workspaceId: "00000000-0000-4000-8000-000000000002", ownerWallet: `0x${"1".repeat(40)}`, connectorId: null }, data.invoiceId);
  expect(result.invoiceDocument).toBeNull();
  expect(result.invoiceNumber).toBeNull();
  expect(result.receiptEmail).toEqual({ state: "not_applicable", deliveries: [] });
});

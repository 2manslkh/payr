import { expect, it, vi } from "vitest";
import { createPublicationService } from "./publication";
import type { PublicationConfig, PublicationRepository } from "./publication-contracts";

it("requires explicit approval before reserving or invoking the document port", async () => {
  const reserve = vi.fn();
  const createOrRead = vi.fn();
  const config: PublicationConfig = { appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(7)]]), chainId: 5042002, contractAddress: `0x${"1".repeat(40)}` };
  const service = createPublicationService({ reserve } as unknown as PublicationRepository, config, { createOrRead });
  await expect(service.publish({ workspaceId: "00000000-0000-4000-8000-000000000001", ownerWallet: `0x${"2".repeat(40)}`, connectorId: null }, {
    draftId: "00000000-0000-4000-8000-000000000002", expectedVersion: 1, approval: false, idempotencyKey: "publish-1",
  })).rejects.toBeDefined();
  expect(reserve).not.toHaveBeenCalled();
  expect(createOrRead).not.toHaveBeenCalled();
});

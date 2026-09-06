import { expect, it, vi } from "vitest";
import { createPublicationWorker } from "./publication-worker";
import type { PublicationRepository } from "./publication-contracts";

it("does not call a provider or expose links when no work can be claimed", async () => {
  const createOrRead = vi.fn();
  const worker = createPublicationWorker({ claim: vi.fn().mockResolvedValue(null) } as unknown as PublicationRepository, {
    appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app", activeKeyVersion: 1, keys: new Map([[1, new Uint8Array(32).fill(7)]]),
  }, { createOrRead });
  expect(await worker.run()).toEqual({ outcome: "idle" });
  expect(createOrRead).not.toHaveBeenCalled();
});

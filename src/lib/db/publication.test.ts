import { expect, it } from "vitest";
import { createPublicationRepository } from "./publication";

it("claims with platform worker identity rather than a fabricated owner", async () => {
  const calls: unknown[] = [];
  const repository = createPublicationRepository({ rpc(name, parameters) {
    calls.push({ name, parameters }); return Promise.resolve({ data: null, error: null });
  } });
  await expect(repository.claim(null, "00000000-0000-4000-8000-000000000001")).resolves.toBeNull();
  expect(calls).toEqual([{ name: "payr_claim_publication_v1", parameters: { p_attempt_id: null, p_lease_owner: "00000000-0000-4000-8000-000000000001" } }]);
});

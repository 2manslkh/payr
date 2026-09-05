import { expect, it } from "vitest";
import { buildAuthMessage } from "./message";

it("reconstructs the frozen login message from stored facts", () => {
  expect(buildAuthMessage({
    id: "00000000-0000-4000-8000-000000000001", workspaceId: null,
    wallet: `0x${"1".repeat(40)}`, purpose: "payr-login-v1", challenge: "A".repeat(43),
    domain: "payrlink.xyz", uri: "https://payrlink.xyz", chainId: 5042002,
    issuedAt: "2026-09-05T00:00:00.000Z", expiresAt: "2026-09-05T00:05:00.000Z",
    consumedAt: null, payoutFrom: null, payoutTo: null, profileRevision: null,
  })).toBe(`payrlink.xyz wants you to sign in to Payr with your Ethereum account:\n0x${"1".repeat(40)}\n\nURI: https://payrlink.xyz\nVersion: 1\nChain ID: 5042002\nNonce: ${"A".repeat(43)}\nIssued At: 2026-09-05T00:00:00.000Z\nExpiration Time: 2026-09-05T00:05:00.000Z\nRequest ID: 00000000-0000-4000-8000-000000000001\nPurpose: payr-login-v1`);
});
